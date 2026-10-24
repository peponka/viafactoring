-- ViaFactoring — 0014: categorías de fondeador, preferencias, feed y
-- modelo de solo comisión.
--
--   * Cada fondeador elige una categoría (inversor individual o institución
--     financiera), sube su documentación y el admin lo aprueba a mano. Sin
--     aprobación no ve facturas.
--   * La categoría fija un rango base de montos por factura; dentro de ese
--     rango el fondeador define sus preferencias (monto, plazo, riesgo, tipo
--     de deudor, industrias). El feed le muestra solo lo que encaja.
--   * Monto mínimo de la plataforma para publicar una factura (USD 3.000 o
--     equivalente), controlado también en la base.
--   * Se deja de cobrar el desbloqueo: «Me interesa» abre el Deal Room gratis
--     (marcar_interes). ViaFactoring cobra solo la comisión de cierre, con
--     una tabla de tramos nueva. Las funciones viejas de desbloqueo pago
--     quedan en la base, sin uso desde la app.
--   * La PyME ve el alcance de su factura: cuántos fondeadores aprobados
--     tienen preferencias que encajan, por categoría (solo conteos).
--
-- Todo es aditivo. Requiere 0001-0013. Rollback al final.

-- =========================================================================
-- 0. Parámetros (ajustables sin migración)
-- =========================================================================

insert into public.app_config (key, value) values
  ('monto_minimo_usd', '3000'),
  ('individual_min_usd', '3000'),
  ('individual_max_usd', '25000'),
  ('institucion_min_usd', '15000')
on conflict (key) do nothing;

-- =========================================================================
-- 1. Datos nuevos en la factura
-- =========================================================================

alter table public.invoices
  add column if not exists deudor_tipo text not null default 'privado'
    check (deudor_tipo in ('privado', 'estado')),
  add column if not exists deudor_ruc text;

-- Monto mínimo al publicar. Si no hay cotización vigente para pasar
-- guaraníes a dólares, no se bloquea (lo valida también la app).
create or replace function public.invoices_monto_minimo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_usd numeric := public.monto_en_usd(new.monto, new.moneda);
  v_min numeric := public.config_num('monto_minimo_usd', 3000);
begin
  if v_usd is not null and v_usd < v_min then
    raise exception 'MONTO_MINIMO: el mínimo para publicar una factura es USD %', replace(to_char(v_min, 'FM999,999,999'), ',', '.');
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_monto_minimo_trg on public.invoices;
create trigger invoices_monto_minimo_trg
  before insert on public.invoices
  for each row execute function public.invoices_monto_minimo();

-- =========================================================================
-- 2. Perfil de fondeador: categoría, verificación y preferencias
-- =========================================================================

create table public.fondeador_perfiles (
  fondeador_id uuid primary key references public.profiles(id) on delete cascade,
  categoria text check (categoria in ('individual', 'institucion')),
  verificacion text not null default 'incompleta'
    check (verificacion in ('incompleta', 'en_revision', 'aprobada', 'rechazada')),
  verificacion_nota text,
  documentos jsonb not null default '[]'::jsonb,
  verificado_at timestamptz,
  verificado_por uuid references public.profiles(id),
  monto_min_usd numeric(14, 2),
  monto_max_usd numeric(14, 2),
  plazo_max_dias int check (plazo_max_dias is null or plazo_max_dias > 0),
  riesgos text[] not null default array['bajo', 'medio']::text[],
  deudor_tipos text[] not null default array['privado', 'estado']::text[],
  industrias uuid[] not null default '{}'::uuid[],
  alertas boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.fondeador_perfiles enable row level security;

create policy "fondeador_perfiles_select_own" on public.fondeador_perfiles
  for select to authenticated using (fondeador_id = auth.uid() or public.is_admin());

-- Nadie escribe directo: todo pasa por las funciones de abajo, que validan
-- rangos y no dejan que un fondeador se apruebe a sí mismo.
revoke insert, update, delete, truncate on public.fondeador_perfiles from anon, authenticated;
grant select on public.fondeador_perfiles to authenticated;
grant select, insert, update, delete on public.fondeador_perfiles to service_role;

-- Fondeadores que ya existían: quedan aprobados (eran cuentas del piloto)
-- y eligen su categoría la próxima vez que entran.
insert into public.fondeador_perfiles (fondeador_id, verificacion, verificado_at, verificacion_nota)
select id, 'aprobada', now(), 'Cuenta anterior a la verificación'
from public.profiles where role = 'fondeador'
on conflict (fondeador_id) do nothing;

-- Alta automática del perfil para fondeadores nuevos.
create or replace function public.crear_fondeador_perfil()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role = 'fondeador' then
    insert into public.fondeador_perfiles (fondeador_id) values (new.id)
    on conflict (fondeador_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_created_perfil on public.profiles;
create trigger on_profile_created_perfil
  after insert on public.profiles
  for each row execute function public.crear_fondeador_perfil();

-- Rango base de una categoría (en USD). Máximo null = sin tope.
create or replace function public.rango_categoria(p_categoria text, out min_usd numeric, out max_usd numeric)
language sql
stable
security definer
set search_path = public
as $$
  select
    case p_categoria
      when 'institucion' then public.config_num('institucion_min_usd', 15000)
      else public.config_num('individual_min_usd', 3000) end,
    case p_categoria
      when 'institucion' then null
      else public.config_num('individual_max_usd', 25000) end;
$$;

grant execute on function public.rango_categoria(text) to authenticated;

-- Elige (o cambia) la categoría y manda la documentación a revisión.
-- p_documentos: lista de rutas en el bucket 'verificaciones', todas dentro
-- de la carpeta del propio usuario.
create or replace function public.enviar_verificacion(p_categoria text, p_documentos jsonb)
returns public.fondeador_perfiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_perfil public.fondeador_perfiles;
  v_rango record;
  v_doc text;
begin
  if public.current_role() is distinct from 'fondeador' then
    raise exception 'Solo los fondeadores completan este paso';
  end if;
  if p_categoria not in ('individual', 'institucion') then
    raise exception 'Categoría no válida';
  end if;
  if jsonb_typeof(p_documentos) <> 'array' or jsonb_array_length(p_documentos) = 0 then
    raise exception 'Subí al menos un documento';
  end if;
  for v_doc in select jsonb_array_elements_text(p_documentos) loop
    if v_doc not like v_uid::text || '/%' then
      raise exception 'Documento no válido';
    end if;
  end loop;

  select * into v_rango from public.rango_categoria(p_categoria);

  insert into public.fondeador_perfiles (fondeador_id) values (v_uid)
  on conflict (fondeador_id) do nothing;

  update public.fondeador_perfiles p
    set categoria = p_categoria,
        documentos = p_documentos,
        -- Un cambio de categoría vuelve a revisión; si ya estaba aprobada en
        -- la misma categoría y solo agrega documentos, sigue aprobada.
        verificacion = case
          when p.verificacion = 'aprobada' and p.categoria is not distinct from p_categoria then 'aprobada'
          else 'en_revision' end,
        verificacion_nota = null,
        -- Las preferencias se encajan en el rango de la categoría nueva.
        monto_min_usd = greatest(coalesce(p.monto_min_usd, v_rango.min_usd), v_rango.min_usd),
        monto_max_usd = case
          when v_rango.max_usd is null then p.monto_max_usd
          else least(coalesce(p.monto_max_usd, v_rango.max_usd), v_rango.max_usd) end,
        updated_at = now()
    where p.fondeador_id = v_uid
    returning * into v_perfil;

  if v_perfil.monto_max_usd is not null and v_perfil.monto_max_usd < v_perfil.monto_min_usd then
    update public.fondeador_perfiles set monto_max_usd = v_rango.max_usd
      where fondeador_id = v_uid returning * into v_perfil;
  end if;

  perform public.log_event('verificacion_enviada', null, null, 'fondeador', v_uid);
  return v_perfil;
end;
$$;

grant execute on function public.enviar_verificacion(text, jsonb) to authenticated;

create or replace function public.guardar_preferencias(
  p_monto_min_usd numeric,
  p_monto_max_usd numeric,
  p_plazo_max_dias int,
  p_riesgos text[],
  p_deudor_tipos text[],
  p_industrias uuid[],
  p_alertas boolean
)
returns public.fondeador_perfiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_perfil public.fondeador_perfiles;
  v_rango record;
begin
  select * into v_perfil from public.fondeador_perfiles where fondeador_id = v_uid for update;
  if not found or v_perfil.categoria is null then
    raise exception 'Primero elegí tu categoría de fondeador';
  end if;
  select * into v_rango from public.rango_categoria(v_perfil.categoria);

  if p_monto_min_usd is null or p_monto_min_usd < v_rango.min_usd then
    raise exception 'El monto mínimo para tu categoría es USD %', replace(to_char(v_rango.min_usd, 'FM999,999,999'), ',', '.');
  end if;
  if v_rango.max_usd is not null and (p_monto_max_usd is null or p_monto_max_usd > v_rango.max_usd) then
    raise exception 'El monto máximo para tu categoría es USD %', replace(to_char(v_rango.max_usd, 'FM999,999,999'), ',', '.');
  end if;
  if p_monto_max_usd is not null and p_monto_max_usd < p_monto_min_usd then
    raise exception 'El monto máximo tiene que ser mayor que el mínimo';
  end if;
  if p_plazo_max_dias is not null and p_plazo_max_dias <= 0 then
    raise exception 'El plazo máximo no es válido';
  end if;
  if coalesce(cardinality(p_riesgos), 0) = 0
     or not (p_riesgos <@ array['bajo', 'medio', 'alto']::text[]) then
    raise exception 'Elegí al menos un nivel de riesgo';
  end if;
  if coalesce(cardinality(p_deudor_tipos), 0) = 0
     or not (p_deudor_tipos <@ array['privado', 'estado']::text[]) then
    raise exception 'Elegí al menos un tipo de deudor';
  end if;

  update public.fondeador_perfiles
    set monto_min_usd = p_monto_min_usd,
        monto_max_usd = p_monto_max_usd,
        plazo_max_dias = p_plazo_max_dias,
        riesgos = p_riesgos,
        deudor_tipos = p_deudor_tipos,
        industrias = coalesce(p_industrias, '{}'::uuid[]),
        alertas = coalesce(p_alertas, true),
        updated_at = now()
    where fondeador_id = v_uid
    returning * into v_perfil;
  return v_perfil;
end;
$$;

grant execute on function public.guardar_preferencias(numeric, numeric, int, text[], text[], uuid[], boolean) to authenticated;

create or replace function public.admin_verificar_fondeador(p_fondeador_id uuid, p_aprobar boolean, p_nota text default null)
returns public.fondeador_perfiles
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perfil public.fondeador_perfiles;
begin
  if not public.is_admin() then
    raise exception 'No autorizado';
  end if;
  update public.fondeador_perfiles
    set verificacion = case when p_aprobar then 'aprobada' else 'rechazada' end,
        verificacion_nota = nullif(trim(p_nota), ''),
        verificado_at = now(),
        verificado_por = auth.uid(),
        updated_at = now()
    where fondeador_id = p_fondeador_id
    returning * into v_perfil;
  if not found then
    raise exception 'Fondeador no encontrado';
  end if;

  perform public.notificar(p_fondeador_id, null, null, 'verificacion',
    case when p_aprobar then 'Tu cuenta fue aprobada' else 'Revisamos tu documentación' end,
    case when p_aprobar then 'Ya podés ver las facturas que encajan con tus preferencias.'
         else coalesce(nullif(trim(p_nota), ''), 'Necesitamos que revises tu documentación.') end,
    case when p_aprobar then 'Ver facturas' else 'Revisar' end);
  perform public.log_event(case when p_aprobar then 'fondeador_aprobado' else 'fondeador_rechazado' end,
    null, null, 'fondeador', p_fondeador_id);
  return v_perfil;
end;
$$;

grant execute on function public.admin_verificar_fondeador(uuid, boolean, text) to authenticated;

-- Bucket privado para la documentación de verificación. Cada fondeador
-- escribe solo en su carpeta; el admin lee por URL firmada desde el server.
insert into storage.buckets (id, name, public)
values ('verificaciones', 'verificaciones', false)
on conflict (id) do nothing;

drop policy if exists "verificaciones_owner_rw" on storage.objects;
create policy "verificaciones_owner_rw" on storage.objects
  for all to authenticated
  using (bucket_id = 'verificaciones' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'verificaciones' and (storage.foldername(name))[1] = auth.uid()::text);

-- =========================================================================
-- 3. ¿Encaja esta factura con las preferencias de un fondeador?
-- =========================================================================

create or replace function public.factura_encaja(p_perfil public.fondeador_perfiles, p_invoice public.invoices)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_usd numeric := public.monto_en_usd(p_invoice.monto, p_invoice.moneda);
  v_rango record;
begin
  if p_perfil.categoria is null then
    return false;
  end if;
  select * into v_rango from public.rango_categoria(p_perfil.categoria);
  if v_usd is null then
    return false;
  end if;
  return v_usd >= greatest(coalesce(p_perfil.monto_min_usd, v_rango.min_usd), v_rango.min_usd)
     and (coalesce(p_perfil.monto_max_usd, v_rango.max_usd) is null
          or v_usd <= coalesce(p_perfil.monto_max_usd, v_rango.max_usd))
     and (p_perfil.plazo_max_dias is null or p_invoice.plazo_dias <= p_perfil.plazo_max_dias)
     and p_invoice.riesgo = any (p_perfil.riesgos)
     and p_invoice.deudor_tipo = any (p_perfil.deudor_tipos)
     and (cardinality(p_perfil.industrias) = 0
          or p_invoice.industry_id = any (p_perfil.industrias)
          or exists (select 1 from public.industries i
                     where i.id = p_invoice.industry_id and i.parent_id = any (p_perfil.industrias)));
end;
$$;

revoke execute on function public.factura_encaja(public.fondeador_perfiles, public.invoices) from public, anon, authenticated;

-- Alcance para la PyME: cuántos fondeadores aprobados encajan, por categoría.
-- Recibe los datos (no la factura) para poder usarlo antes de publicar.
create or replace function public.alcance_factura(
  p_monto numeric,
  p_moneda text,
  p_plazo_dias int,
  p_riesgo text,
  p_deudor_tipo text,
  p_rubro text default null,
  out instituciones int,
  out inversores int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fake public.invoices;
begin
  if auth.uid() is null then
    raise exception 'No autorizado';
  end if;
  v_fake.monto := p_monto;
  v_fake.moneda := coalesce(p_moneda, 'USD');
  v_fake.plazo_dias := coalesce(p_plazo_dias, 0);
  v_fake.riesgo := coalesce(p_riesgo, 'medio');
  v_fake.deudor_tipo := coalesce(p_deudor_tipo, 'privado');
  v_fake.rubro := p_rubro;
  v_fake.industry_id := case when nullif(trim(p_rubro), '') is null then null
                             else public.industria_desde_rubro(p_rubro) end;

  select
    count(*) filter (where p.categoria = 'institucion'),
    count(*) filter (where p.categoria = 'individual')
  into instituciones, inversores
  from public.fondeador_perfiles p
  where p.verificacion = 'aprobada'
    and public.factura_encaja(p, v_fake);
end;
$$;

grant execute on function public.alcance_factura(numeric, text, int, text, text, text) to authenticated;

-- =========================================================================
-- 4. Feed: «Paso» y «Me interesa»
-- =========================================================================

create table public.invoice_pasadas (
  fondeador_id uuid not null references public.profiles(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (fondeador_id, invoice_id)
);

alter table public.invoice_pasadas enable row level security;
create policy "invoice_pasadas_own" on public.invoice_pasadas
  for all to authenticated
  using (fondeador_id = auth.uid())
  with check (fondeador_id = auth.uid() and public.current_role() = 'fondeador');
revoke update, truncate on public.invoice_pasadas from anon, authenticated;
grant select, insert, delete on public.invoice_pasadas to authenticated;
grant select, insert, update, delete on public.invoice_pasadas to service_role;

-- «Me interesa»: abre el Deal Room gratis. Devuelve el id del Deal Room.
create or replace function public.marcar_interes(p_invoice_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_perfil public.fondeador_perfiles;
  v_invoice public.invoices;
  v_room public.reveals;
begin
  if public.current_role() is distinct from 'fondeador' then
    raise exception 'Solo los fondeadores pueden marcar interés';
  end if;

  select * into v_room from public.reveals where invoice_id = p_invoice_id and fondeador_id = v_uid;
  if found then
    return v_room.id;
  end if;

  select * into v_perfil from public.fondeador_perfiles where fondeador_id = v_uid;
  if not found or v_perfil.verificacion <> 'aprobada' then
    raise exception 'Tu cuenta todavía está en revisión';
  end if;
  if v_perfil.categoria is null then
    raise exception 'Primero elegí tu categoría de fondeador';
  end if;

  select * into v_invoice from public.invoices where id = p_invoice_id for update;
  if not found or v_invoice.estado <> 'disponible' then
    raise exception 'Esta factura ya no está disponible';
  end if;

  -- La categoría pone el límite duro (las preferencias solo filtran el feed).
  declare
    v_usd numeric := public.monto_en_usd(v_invoice.monto, v_invoice.moneda);
    v_rango record;
  begin
    select * into v_rango from public.rango_categoria(v_perfil.categoria);
    if v_usd is not null and (v_usd < v_rango.min_usd or (v_rango.max_usd is not null and v_usd > v_rango.max_usd)) then
      raise exception 'Esta factura está fuera del rango de tu categoría';
    end if;
  end;

  insert into public.reveals (invoice_id, fondeador_id)
    values (p_invoice_id, v_uid)
    returning * into v_room;
  delete from public.invoice_pasadas where fondeador_id = v_uid and invoice_id = p_invoice_id;
  perform public.log_event('interes', p_invoice_id, v_room.id, 'reveal', v_room.id);
  return v_room.id;
end;
$$;

grant execute on function public.marcar_interes(uuid) to authenticated;

-- El aviso a la PyME al abrirse un Deal Room ya no habla de "desbloqueo".
create or replace function public.deal_room_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quien text;
  v_msg uuid;
  v_op uuid;
begin
  select coalesce(nullif(p.empresa, ''), nullif(p.nombre, ''), 'Un fondeador') into v_quien
    from public.profiles p where p.id = new.fondeador_id;
  select operador_id into v_op from public.invoices where id = new.invoice_id;

  v_msg := public.evento_chat(new.id,
    '✨ ' || coalesce(v_quien, 'Un fondeador') || ' marcó interés en esta factura. '
      || 'Pueden conversar, compartir documentos y negociar acá mismo.',
    jsonb_build_object('kind', 'desbloqueo'));
  perform public.notificar(v_op, new.id, v_msg, 'desbloqueo',
    'Un fondeador se interesó en tu factura',
    coalesce(v_quien, 'Un fondeador') || ' quiere negociar y puede escribirte.',
    'Ir a la conversación');
  return new;
end;
$$;

-- =========================================================================
-- 5. Comisión de cierre: tramos nuevos (en USD sobre el monto ofrecido)
-- =========================================================================

create or replace function public.deal_fee_for_monto(p_monto numeric)
returns numeric
language sql
immutable
as $$
  select case
    when p_monto is null then 0
    when p_monto < 10000 then 80
    when p_monto < 25000 then 180
    when p_monto < 50000 then 350
    else ceil(p_monto * 0.007)
  end;
$$;

grant execute on function public.deal_fee_for_monto(numeric) to authenticated;

-- =========================================================================
-- 6. Vista de teasers: suma tipo de deudor, monto en USD y si ya se pasó.
--    (Solo se agregan columnas al final; las anteriores quedan iguales.)
-- =========================================================================

create or replace view public.invoice_teasers
with (security_invoker = false)
as
select
  i.id,
  i.rubro,
  i.monto,
  i.moneda,
  i.plazo_dias,
  i.fecha_vencimiento,
  public.monto_banda(i.monto) as monto_banda,
  public.plazo_banda(i.plazo_dias) as plazo_banda,
  i.riesgo,
  case when cardinality(public.detectar_contacto(i.descripcion)) > 0 then null
       else i.descripcion end as descripcion,
  i.estado,
  i.created_at,
  case when public.monto_en_usd(i.monto, i.moneda) is null then null
       else public.unlock_fee_for_monto(public.monto_en_usd(i.monto, i.moneda)) end as unlock_fee,
  exists (
    select 1 from public.reveals r
    where r.invoice_id = i.id and r.fondeador_id = auth.uid()
  ) as ya_revelada,
  i.industry_id,
  ind.slug as industria_slug,
  ind.nombre as industria_nombre,
  padre.nombre as industria_padre_nombre,
  public.public_industry_data(i.industry_id, i.industry_data) as industry_data_publica,
  i.ubicacion,
  i.deudor_tipo,
  public.monto_en_usd(i.monto, i.moneda) as monto_usd,
  exists (
    select 1 from public.invoice_pasadas x
    where x.invoice_id = i.id and x.fondeador_id = auth.uid()
  ) as ya_pasada,
  (select count(*)::int from public.offers o
    where o.invoice_id = i.id and o.estado in ('pendiente', 'aceptada')) as ofertas_activas
from public.invoices i
left join public.industries ind on ind.id = i.industry_id
left join public.industries padre on padre.id = ind.parent_id
where i.estado = 'disponible'
   or exists (
        select 1 from public.reveals r
        where r.invoice_id = i.id and r.fondeador_id = auth.uid()
      );

grant select on public.invoice_teasers to authenticated;

-- =========================================================================
-- ROLLBACK (en orden inverso)
-- =========================================================================
-- (re-crear invoice_teasers, deal_room_after_insert y deal_fee_for_monto
--  con sus definiciones de 0012 / 0002)
-- drop function if exists public.marcar_interes(uuid), public.alcance_factura(numeric, text, int, text, text, text),
--   public.factura_encaja(public.fondeador_perfiles, public.invoices),
--   public.admin_verificar_fondeador(uuid, boolean, text),
--   public.guardar_preferencias(numeric, numeric, int, text[], text[], uuid[], boolean),
--   public.enviar_verificacion(text, jsonb), public.rango_categoria(text),
--   public.crear_fondeador_perfil(), public.invoices_monto_minimo();
-- drop trigger if exists on_profile_created_perfil on public.profiles;
-- drop trigger if exists invoices_monto_minimo_trg on public.invoices;
-- drop policy if exists "verificaciones_owner_rw" on storage.objects;
-- drop table if exists public.invoice_pasadas, public.fondeador_perfiles;
-- alter table public.invoices drop column deudor_tipo, drop column deudor_ruc;

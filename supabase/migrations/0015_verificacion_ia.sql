-- ViaFactoring — 0015: ficha de verificación de la factura.
--
--   * La factura guarda su CDC (código de control de la factura electrónica
--     del SIFEN, 44 dígitos) y el RUC del emisor.
--   * La base calcula sola los controles de coherencia (verificacion): que el
--     CDC tenga el formato y el dígito verificador correctos, que el RUC y el
--     número que trae coincidan con lo declarado, y si la factura ya se cargó
--     antes. Lo hace un trigger: nadie puede escribir esos resultados a mano.
--   * Dos facturas activas no pueden tener el mismo CDC.
--   * La investigación con IA (datos públicos del deudor) la guarda solo el
--     servidor con la service role, una vez por factura, y la ven las partes
--     del Deal Room.
--
-- Todo es aditivo. Requiere 0014. Rollback al final.

alter table public.invoices
  add column if not exists cdc text,
  add column if not exists emisor_ruc text,
  add column if not exists verificacion jsonb not null default '{}'::jsonb,
  add column if not exists investigacion jsonb,
  add column if not exists investigacion_at timestamptz;

-- Dígito verificador módulo 11 del SET (el mismo para RUC y CDC).
create or replace function public.dv_mod11(p_numero text)
returns int
language plpgsql
immutable
as $$
declare
  v_total int := 0;
  v_k int := 2;
  v_resto int;
  i int;
begin
  if p_numero is null or p_numero !~ '^[0-9]+$' then
    return null;
  end if;
  for i in reverse length(p_numero) .. 1 loop
    v_total := v_total + substr(p_numero, i, 1)::int * v_k;
    v_k := v_k + 1;
    if v_k > 11 then
      v_k := 2;
    end if;
  end loop;
  v_resto := v_total % 11;
  return case when v_resto > 1 then 11 - v_resto else 0 end;
end;
$$;

grant execute on function public.dv_mod11(text) to authenticated;

-- RUC sin dígito verificador ni ceros a la izquierda ("0080012345-6" → "80012345").
create or replace function public.ruc_base(p_ruc text)
returns text
language sql
immutable
as $$
  select nullif(ltrim(split_part(regexp_replace(coalesce(p_ruc, ''), '[^0-9-]', '', 'g'), '-', 1), '0'), '');
$$;

-- Controles de coherencia. Solo lee la factura y la tabla de facturas.
create or replace function public.calcular_verificacion(p_inv public.invoices)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cdc text := p_inv.cdc;
  v_ok_formato boolean;
  v_ok_dv boolean;
  v_ruc_cdc text;
  v_num_cdc text;
  v_num_decl text;
  v_fecha date;
  v_dup boolean;
  v_partes text[];
begin
  if v_cdc is null then
    return jsonb_build_object('cdc_presente', false, 'calculado_at', now());
  end if;

  v_ok_formato := v_cdc ~ '^[0-9]{44}$';
  v_ok_dv := v_ok_formato and public.dv_mod11(left(v_cdc, 43)) = right(v_cdc, 1)::int;

  if v_ok_formato then
    v_ruc_cdc := nullif(ltrim(substr(v_cdc, 3, 8), '0'), '');
    -- establecimiento-punto-número, sin ceros de relleno
    v_num_cdc := ltrim(substr(v_cdc, 12, 3), '0') || '-' || ltrim(substr(v_cdc, 15, 3), '0') || '-' || ltrim(substr(v_cdc, 18, 7), '0');
    begin
      v_fecha := to_date(substr(v_cdc, 26, 8), 'YYYYMMDD');
    exception when others then
      v_fecha := null;
    end;
  end if;

  if p_inv.numero is not null then
    v_partes := regexp_split_to_array(regexp_replace(p_inv.numero, '[^0-9-]', '', 'g'), '-');
    if cardinality(v_partes) = 3 then
      v_num_decl := ltrim(v_partes[1], '0') || '-' || ltrim(v_partes[2], '0') || '-' || ltrim(v_partes[3], '0');
    end if;
  end if;

  select exists (
    select 1 from public.invoices o
    where o.cdc = v_cdc and o.id is distinct from p_inv.id
  ) into v_dup;

  return jsonb_build_object(
    'cdc_presente', true,
    'cdc_formato', v_ok_formato,
    'cdc_dv_ok', coalesce(v_ok_dv, false),
    'es_factura', v_ok_formato and left(v_cdc, 2) = '01',
    'ruc_coincide', case
      when not v_ok_formato or public.ruc_base(p_inv.emisor_ruc) is null then null
      else public.ruc_base(p_inv.emisor_ruc) = v_ruc_cdc end,
    'numero_coincide', case
      when not v_ok_formato or v_num_decl is null then null
      else v_num_decl = v_num_cdc end,
    'fecha_emision', v_fecha,
    'vencimiento_coherente', case
      when v_fecha is null or p_inv.fecha_vencimiento is null then null
      else p_inv.fecha_vencimiento >= v_fecha end,
    'duplicada', v_dup,
    'calculado_at', now()
  );
end;
$$;

revoke execute on function public.calcular_verificacion(public.invoices) from public, anon, authenticated;

-- SECURITY INVOKER a propósito (como invoices_guard): así current_user es
-- quien escribe. La investigación solo la escribe el servidor (service role).
create or replace function public.invoices_proteger_investigacion()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      new.investigacion := null;
      new.investigacion_at := null;
    else
      new.investigacion := old.investigacion;
      new.investigacion_at := old.investigacion_at;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_a_proteger_investigacion_trg on public.invoices;
create trigger invoices_a_proteger_investigacion_trg
  before insert or update on public.invoices
  for each row execute function public.invoices_proteger_investigacion();

-- Calcula la verificación (necesita leer otras facturas para detectar
-- duplicados, por eso es SECURITY DEFINER). Corre después del anterior.
create or replace function public.invoices_verificacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Normaliza el CDC (solo dígitos).
  if new.cdc is not null then
    new.cdc := nullif(regexp_replace(new.cdc, '[^0-9]', '', 'g'), '');
  end if;

  -- Si cambian los datos que se cruzan, la investigación previa ya no vale.
  if tg_op = 'UPDATE'
     and (new.deudor_nombre, new.deudor_ruc) is distinct from (old.deudor_nombre, old.deudor_ruc) then
    new.investigacion := null;
    new.investigacion_at := null;
  end if;

  new.verificacion := public.calcular_verificacion(new);
  return new;
end;
$$;

drop trigger if exists invoices_verificacion_trg on public.invoices;
create trigger invoices_verificacion_trg
  before insert or update on public.invoices
  for each row execute function public.invoices_verificacion();

-- Dos facturas activas no pueden compartir CDC.
create unique index if not exists invoices_cdc_activo_uidx
  on public.invoices (cdc)
  where cdc is not null and estado <> 'retirada';

-- Las facturas que ya existían no tienen CDC: quedan con verificación vacía
-- ('cdc_presente' falso) hasta que se editen.

-- -------------------------------------------------------------------------
-- Ficha para las partes de un Deal Room
-- -------------------------------------------------------------------------

create or replace function public.ficha_verificacion(p_reveal_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_room public.reveals;
  v_inv public.invoices;
begin
  select * into v_room from public.reveals where id = p_reveal_id;
  if not found then
    raise exception 'Negociación no encontrada';
  end if;
  if not (public.is_deal_room_member(p_reveal_id) or public.is_admin()) then
    raise exception 'No sos parte de esta negociación';
  end if;
  select * into v_inv from public.invoices where id = v_room.invoice_id;

  return jsonb_build_object(
    'invoice_id', v_inv.id,
    'cdc', v_inv.cdc,
    'emisor_ruc', v_inv.emisor_ruc,
    'emisor_nombre', (select coalesce(nullif(p.empresa, ''), p.nombre) from public.profiles p where p.id = v_inv.operador_id),
    'deudor_nombre', v_inv.deudor_nombre,
    'deudor_ruc', v_inv.deudor_ruc,
    'deudor_tipo', v_inv.deudor_tipo,
    'verificacion', v_inv.verificacion,
    'investigacion', v_inv.investigacion,
    'investigacion_at', v_inv.investigacion_at
  );
end;
$$;

grant execute on function public.ficha_verificacion(uuid) to authenticated;

-- Reserva la investigación para que dos pedidos simultáneos no paguen dos
-- veces la misma búsqueda. Devuelve 'lista', 'en_curso' o 'reservada'.
create or replace function public.reservar_investigacion(p_reveal_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.reveals;
  v_inv public.invoices;
begin
  select * into v_room from public.reveals where id = p_reveal_id;
  if not found or not (public.is_deal_room_member(p_reveal_id) or public.is_admin()) then
    raise exception 'No sos parte de esta negociación';
  end if;
  select * into v_inv from public.invoices where id = v_room.invoice_id for update;

  -- Lista, o falló hace poco (no reintentar solo en cada visita: la pantalla
  -- ofrece reintentar a mano).
  if v_inv.investigacion->>'estado' = 'lista'
     or (v_inv.investigacion->>'estado' = 'error' and v_inv.investigacion_at > now() - interval '1 hour') then
    return 'lista';
  end if;
  if v_inv.investigacion->>'estado' = 'en_curso'
     and v_inv.investigacion_at > now() - interval '3 minutes' then
    return 'en_curso';
  end if;

  update public.invoices
    set investigacion = jsonb_build_object('estado', 'en_curso'),
        investigacion_at = now()
    where id = v_inv.id;
  return 'reservada';
end;
$$;

grant execute on function public.reservar_investigacion(uuid) to authenticated;

-- -------------------------------------------------------------------------
-- Vista de teasers: suma un resumen de la verificación sin datos que
-- identifiquen a nadie (solo verdadero / falso).
-- -------------------------------------------------------------------------

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
    where o.invoice_id = i.id and o.estado in ('pendiente', 'aceptada')) as ofertas_activas,
  jsonb_build_object(
    'cdc_presente', coalesce((i.verificacion->>'cdc_presente')::boolean, false),
    'cdc_dv_ok', (i.verificacion->>'cdc_dv_ok')::boolean,
    'ruc_coincide', (i.verificacion->>'ruc_coincide')::boolean,
    'numero_coincide', (i.verificacion->>'numero_coincide')::boolean,
    'duplicada', (i.verificacion->>'duplicada')::boolean
  ) as verificacion
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
-- ROLLBACK
-- =========================================================================
-- (re-crear invoice_teasers con su definición de 0014)
-- drop function if exists public.reservar_investigacion(uuid), public.ficha_verificacion(uuid),
--   public.invoices_verificacion(), public.invoices_proteger_investigacion(), public.calcular_verificacion(public.invoices),
--   public.ruc_base(text), public.dv_mod11(text);
-- drop trigger if exists invoices_verificacion_trg on public.invoices;
-- drop trigger if exists invoices_a_proteger_investigacion_trg on public.invoices;
-- drop index if exists public.invoices_cdc_activo_uidx;
-- alter table public.invoices drop column cdc, drop column emisor_ruc, drop column verificacion,
--   drop column investigacion, drop column investigacion_at;

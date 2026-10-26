-- 0022 · Más categorías de fondeador
--   individual   Inversor individual               USD 3.000 – 25.000
--   empresa      Empresa o family office            USD 5.000 – 100.000
--   cooperativa  Cooperativa                        desde USD 10.000
--   financiera   Financiera                         desde USD 15.000
--   banco        Banco                              desde USD 25.000
--   fondo        Fondo de inversión o casa de bolsa desde USD 25.000
-- La antigua «institucion» pasa a «financiera». Los rangos se ajustan sin
-- migración desde app_config. Para la PyME se agrupan en «inversores»
-- (individual, empresa) e «instituciones» (el resto).

insert into public.app_config (key, value) values
  ('empresa_min_usd', '5000'),
  ('empresa_max_usd', '100000'),
  ('cooperativa_min_usd', '10000'),
  ('financiera_min_usd', '15000'),
  ('banco_min_usd', '25000'),
  ('fondo_min_usd', '25000')
on conflict (key) do nothing;

alter table public.fondeador_perfiles drop constraint if exists fondeador_perfiles_categoria_check;
update public.fondeador_perfiles set categoria = 'financiera' where categoria = 'institucion';
alter table public.fondeador_perfiles add constraint fondeador_perfiles_categoria_check
  check (categoria in ('individual', 'empresa', 'cooperativa', 'financiera', 'banco', 'fondo'));

create or replace function public.rango_categoria(p_categoria text, out min_usd numeric, out max_usd numeric)
language sql
stable
security definer
set search_path = public
as $$
  select
    case p_categoria
      when 'empresa' then public.config_num('empresa_min_usd', 5000)
      when 'cooperativa' then public.config_num('cooperativa_min_usd', 10000)
      when 'financiera' then public.config_num('financiera_min_usd', public.config_num('institucion_min_usd', 15000))
      when 'banco' then public.config_num('banco_min_usd', 25000)
      when 'fondo' then public.config_num('fondo_min_usd', 25000)
      else public.config_num('individual_min_usd', 3000) end,
    case p_categoria
      when 'individual' then public.config_num('individual_max_usd', 25000)
      when 'empresa' then public.config_num('empresa_max_usd', 100000)
      else null end;
$$;

grant execute on function public.rango_categoria(text) to authenticated;

create or replace function public.es_categoria_inversor(p_categoria text)
returns boolean
language sql
immutable
as $$
  select p_categoria in ('individual', 'empresa');
$$;

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
  if p_categoria is null or p_categoria not in ('individual', 'empresa', 'cooperativa', 'financiera', 'banco', 'fondo') then
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
    count(*) filter (where not public.es_categoria_inversor(p.categoria)),
    count(*) filter (where public.es_categoria_inversor(p.categoria))
  into instituciones, inversores
  from public.fondeador_perfiles p
  where p.verificacion = 'aprobada'
    and public.factura_encaja(p, v_fake);
end;
$$;

grant execute on function public.alcance_factura(numeric, text, int, text, text, text) to authenticated;

create or replace function public.etiqueta_fondeador(p_fondeador_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select 'Fondeador verificado · ' || case p.categoria
             when 'empresa' then 'Empresa inversora'
             when 'cooperativa' then 'Cooperativa'
             when 'financiera' then 'Financiera'
             when 'banco' then 'Banco'
             when 'fondo' then 'Fondo de inversión'
             else 'Inversor individual' end
    from public.fondeador_perfiles p
    where p.fondeador_id = p_fondeador_id and p.categoria is not null
  ), 'Fondeador verificado');
$$;

revoke execute on function public.etiqueta_fondeador(uuid) from public, anon, authenticated;

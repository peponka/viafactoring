-- 0021 · Monto leído de la factura y vencimiento obligatorio
--   * monto_leido / moneda_leida: lo que la IA leyó del PDF. Solo lo escribe
--     el servidor (service role) después de verificar la lectura; un cliente
--     no puede ponerlo ni cambiarlo. Si no coincide con el monto publicado,
--     la verificación lo marca (monto_coincide = false) y el fondeador lo ve.
--   * fecha de vencimiento obligatoria en las facturas nuevas.

alter table public.invoices
  add column if not exists monto_leido numeric(14, 2),
  add column if not exists moneda_leida text;

-- Clientes: no pueden escribir investigación ni monto leído.
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
      new.monto_leido := null;
      new.moneda_leida := null;
    else
      new.investigacion := old.investigacion;
      new.investigacion_at := old.investigacion_at;
      new.monto_leido := old.monto_leido;
      new.moneda_leida := old.moneda_leida;
    end if;
  end if;
  return new;
end;
$$;

create or replace function public.invoices_verificacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.cdc is not null then
    new.cdc := nullif(regexp_replace(new.cdc, '[^0-9]', '', 'g'), '');
  end if;

  if tg_op = 'UPDATE'
     and (new.deudor_nombre, new.deudor_ruc) is distinct from (old.deudor_nombre, old.deudor_ruc) then
    new.investigacion := null;
    new.investigacion_at := null;
  end if;

  new.verificacion := public.calcular_verificacion(new) || jsonb_build_object(
    'monto_coincide', case
      when new.monto_leido is null then null
      when new.moneda_leida is not null and new.moneda_leida <> new.moneda then false
      else abs(new.monto - new.monto_leido) <= greatest(1, new.monto_leido * 0.005) end,
    'monto_leido', new.monto_leido,
    'moneda_leida', new.moneda_leida);
  return new;
end;
$$;

-- Vencimiento obligatorio y no pasado en las facturas nuevas.
create or replace function public.invoices_vencimiento_obligatorio()
returns trigger
language plpgsql
as $$
begin
  if new.fecha_vencimiento is null then
    raise exception 'VENCIMIENTO: completá la fecha de vencimiento de la factura';
  end if;
  if new.fecha_vencimiento < (now() at time zone 'America/Asuncion')::date then
    raise exception 'VENCIMIENTO: la factura ya está vencida';
  end if;
  return new;
end;
$$;

drop trigger if exists invoices_vencimiento_obligatorio_trg on public.invoices;
create trigger invoices_vencimiento_obligatorio_trg
  before insert on public.invoices
  for each row execute function public.invoices_vencimiento_obligatorio();

-- El resumen de verificación del feed suma la comparación del monto.
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
    'duplicada', (i.verificacion->>'duplicada')::boolean,
    'monto_coincide', (i.verificacion->>'monto_coincide')::boolean
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

-- Recalcula la verificación de las facturas activas.
update public.invoices set cdc = cdc where estado <> 'retirada';

-- 0016 · Cotización de respaldo para pasar guaraníes a dólares
--
-- Antes, si no había cotización de los últimos 3 días, monto_en_usd()
-- devolvía null: el mínimo de USD 3.000 no se aplicaba y las facturas en
-- guaraníes no le aparecían a ningún fondeador. Ahora usa, en orden:
--   1. la cotización vigente (últimos 3 días, la carga el tick diario);
--   2. la última cotización conocida, aunque sea vieja;
--   3. app_config.tipo_cambio_respaldo (editable sin migración).
-- La alerta al admin por falta de cotización (tipo_cambio_vigente) no cambia.

insert into public.app_config (key, value) values ('tipo_cambio_respaldo', '5800')
on conflict (key) do nothing;

create or replace function public.monto_en_usd(p_monto numeric, p_moneda text)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_pyg numeric;
begin
  if p_monto is null then
    return null;
  end if;
  if p_moneda = 'USD' then
    return p_monto;
  end if;
  if p_moneda = 'PYG' then
    v_pyg := (public.tipo_cambio_vigente()).pyg_por_unidad;
    if v_pyg is null then
      select pyg_por_unidad into v_pyg
      from public.fx_rates
      where moneda = 'USD'
      order by fecha desc
      limit 1;
    end if;
    v_pyg := coalesce(v_pyg, public.config_num('tipo_cambio_respaldo', 5800));
    return round(p_monto / v_pyg, 2);
  end if;
  return null;
end;
$$;

grant execute on function public.monto_en_usd(numeric, text) to authenticated;

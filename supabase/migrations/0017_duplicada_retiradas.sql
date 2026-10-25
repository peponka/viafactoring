-- 0017 · "Ya cargada antes" sin falsos positivos
--
-- Si una pyme retira su factura y la vuelve a publicar, no es una factura
-- repetida. Cuenta como repetida solo si el mismo CDC está activo en otra
-- factura, o si lo cargó otra empresa (aunque esté retirada).


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
    where o.cdc = v_cdc
      and o.id is distinct from p_inv.id
      and (o.estado <> 'retirada' or o.operador_id is distinct from p_inv.operador_id)
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

-- Recalcula las facturas que ya tienen CDC (el trigger vuelve a verificar).
update public.invoices set cdc = cdc where cdc is not null and estado <> 'retirada';

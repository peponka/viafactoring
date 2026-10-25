-- 0018 · Que no nos salteen la comisión
--
-- Hasta que el fondeador paga la comisión de cierre (nivel 4):
--   * el PDF de la factura no se le habilita (trae RUC, teléfono, email);
--   * cada parte ve a la otra sin nombre: «La PyME» / «Fondeador verificado
--     · Inversor individual»; el nombre de la PyME también se tapa en la
--     investigación con IA;
--   * el aviso «marcó interés» ya no dice quién es el fondeador.
-- Además, al retirar una factura la PyME indica el motivo; si cerró con un
-- fondeador que conoció acá, se abre una excepción para cobrar la comisión.

-- 1. El PDF de la factura, recién con la comisión paga --------------------

update public.documents set nivel_minimo = 4 where tipo = 'factura';

create or replace function public.sync_documento_factura()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.documento_url is not null
     and (tg_op = 'INSERT' or new.documento_url is distinct from old.documento_url) then
    insert into public.documents (invoice_id, subido_por, storage_path, nombre, tipo, nivel_minimo)
    values (new.id, new.operador_id, new.documento_url,
            regexp_replace(new.documento_url, '^.*/', ''), 'factura', 4)
    on conflict (storage_path) do nothing;
  end if;
  return new;
end;
$$;

revoke execute on function public.sync_documento_factura() from public, anon, authenticated;

-- 2. Identidades ocultas hasta la comisión --------------------------------

create or replace function public.etiqueta_fondeador(p_fondeador_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((
    select 'Fondeador verificado · ' || case p.categoria
             when 'institucion' then 'Institución financiera'
             else 'Inversor individual' end
    from public.fondeador_perfiles p
    where p.fondeador_id = p_fondeador_id and p.categoria is not null
  ), 'Fondeador verificado');
$$;

revoke execute on function public.etiqueta_fondeador(uuid) from public, anon, authenticated;

-- Reemplaza los nombres dados (sin distinguir mayúsculas) por «la PyME».
create or replace function public.tapar_nombres(p_texto text, p_nombres text[])
returns text
language plpgsql
immutable
as $$
declare
  n text;
  r text := p_texto;
begin
  if r is null then
    return null;
  end if;
  foreach n in array coalesce(p_nombres, '{}') loop
    n := trim(coalesce(n, ''));
    if length(n) >= 3 then
      r := regexp_replace(r, regexp_replace(n, '([.^$*+?()\[\]{}|\\])', '\\\1', 'g'), 'la PyME', 'gi');
    end if;
  end loop;
  return r;
end;
$$;

create or replace function public.get_deal_room_detail(p_reveal_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text := public.deal_room_rol(p_reveal_id);
  v_room public.reveals;
  v_inv public.invoices;
  v_nivel smallint;
  v_otro public.profiles;
  v_contraparte jsonb;
  v_ind text;
begin
  if v_rol is null then
    raise exception 'No sos parte de esta negociación';
  end if;

  select * into v_room from public.reveals where id = p_reveal_id;
  select * into v_inv from public.invoices where id = v_room.invoice_id;
  v_nivel := public.nivel_deal_room(p_reveal_id);
  select nombre into v_ind from public.industries where id = v_inv.industry_id;

  if v_rol = 'fondeador' then
    select * into v_otro from public.profiles where id = v_inv.operador_id;
  else
    select * into v_otro from public.profiles where id = v_room.fondeador_id;
  end if;

  if v_nivel >= 4 or v_rol = 'admin' then
    v_contraparte := jsonb_build_object('nombre', v_otro.nombre, 'empresa', v_otro.empresa,
                                        'email', v_otro.email, 'telefono', v_otro.telefono);
  elsif v_rol = 'fondeador' then
    v_contraparte := jsonb_build_object('nombre', 'La PyME', 'empresa', null, 'oculto', true);
  else
    v_contraparte := jsonb_build_object('nombre', public.etiqueta_fondeador(v_room.fondeador_id),
                                        'empresa', null, 'oculto', true);
  end if;

  if v_rol = 'fondeador' and not public.vista_reciente(p_reveal_id, 'vista_deal_room') then
    perform public.log_event('vista_deal_room', v_room.invoice_id, p_reveal_id, 'reveal', p_reveal_id);
  end if;

  return jsonb_build_object(
    'reveal_id', v_room.id,
    'rol', v_rol,
    'estado', v_room.estado,
    'etapa', case v_room.estado
               when 'open' then 'negociacion'
               when 'negotiating' then
                 case when exists (select 1 from public.offers where reveal_id = v_room.id and estado = 'pendiente')
                      then 'oferta' else 'negociacion' end
               when 'offer_accepted' then 'cierre'
               when 'closing' then 'cierre'
               when 'closed' then 'finalizada'
               else 'cerrada' end,
    'turno', public.turno_deal_room(p_reveal_id),
    'nivel', v_nivel,
    'checklist', v_room.checklist,
    'revealed_at', v_room.revealed_at,
    'contacto_liberado_at', v_room.contacto_liberado_at,
    'cerrado_at', v_room.cerrado_at,
    'cancelado_motivo', v_room.cancelado_motivo,
    'industria', v_ind,
    'invoice', public.invoice_json_para(v_room.invoice_id, v_room.id, v_rol in ('operador', 'admin')),
    'contraparte', v_contraparte,
    'ofertas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', o.id, 'autor_rol', o.autor_rol, 'monto_ofrecido', o.monto_ofrecido,
               'mensaje', o.mensaje, 'estado', o.estado, 'parent_offer_id', o.parent_offer_id,
               'con_recurso', o.con_recurso, 'notifica_deudor', o.notifica_deudor,
               'fecha_pago_prevista', o.fecha_pago_prevista, 'created_at', o.created_at,
               'expira_at', o.expira_at,
               'fondos_enviados_at', o.fondos_enviados_at, 'fondos_recibidos_at', o.fondos_recibidos_at)
             order by o.created_at)
      from public.offers o where o.reveal_id = v_room.id), '[]'::jsonb),
    'comision', (
      select jsonb_build_object('id', p.id, 'monto', p.monto, 'moneda', p.moneda,
                                'monto_usd', p.monto_usd, 'monto_cobro', p.monto_cobro,
                                'moneda_cobro', p.moneda_cobro, 'estado', p.estado)
      from public.payment_requests p
      join public.offers o on o.id = p.offer_id
      where o.reveal_id = v_room.id and p.tipo = 'comision'
      order by p.created_at desc limit 1)
  );
end;
$$;

grant execute on function public.get_deal_room_detail(uuid) to authenticated;


-- Ficha de verificación: sin nombre de la PyME para el fondeador hasta la
-- comisión, también dentro del texto de la investigación.
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
  v_op public.profiles;
  v_tapar boolean;
  v_inves jsonb;
begin
  select * into v_room from public.reveals where id = p_reveal_id;
  if not found then
    raise exception 'Negociación no encontrada';
  end if;
  if not (public.is_deal_room_member(p_reveal_id) or public.is_admin()) then
    raise exception 'No sos parte de esta negociación';
  end if;
  select * into v_inv from public.invoices where id = v_room.invoice_id;
  select * into v_op from public.profiles where id = v_inv.operador_id;

  v_tapar := v_room.fondeador_id = auth.uid() and public.nivel_deal_room(p_reveal_id) < 4;
  v_inves := v_inv.investigacion;
  if v_tapar and v_inves is not null then
    begin
      v_inves := public.tapar_nombres(v_inves::text, array[v_op.empresa, v_op.nombre])::jsonb;
    exception when others then
      v_inves := v_inv.investigacion - 'resumen' - 'hallazgos';
    end;
  end if;

  return jsonb_build_object(
    'invoice_id', v_inv.id,
    'cdc', v_inv.cdc,
    'emisor_ruc', v_inv.emisor_ruc,
    'emisor_nombre', case when v_tapar then null else coalesce(nullif(v_op.empresa, ''), v_op.nombre) end,
    'deudor_nombre', v_inv.deudor_nombre,
    'deudor_ruc', v_inv.deudor_ruc,
    'deudor_tipo', v_inv.deudor_tipo,
    'verificacion', v_inv.verificacion,
    'investigacion', v_inves,
    'investigacion_at', v_inv.investigacion_at
  );
end;
$$;

grant execute on function public.ficha_verificacion(uuid) to authenticated;

-- Aviso a la PyME al abrirse la negociación, sin decir quién es.
create or replace function public.deal_room_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_quien text := public.etiqueta_fondeador(new.fondeador_id);
  v_msg uuid;
  v_op uuid;
begin
  select operador_id into v_op from public.invoices where id = new.invoice_id;

  v_msg := public.evento_chat(new.id,
    '✨ Un ' || lower(left(v_quien, 1)) || substr(v_quien, 2) || ' marcó interés en esta factura. '
      || 'Pueden conversar y negociar acá mismo. Los datos de contacto se comparten al cerrar el trato.',
    jsonb_build_object('kind', 'desbloqueo'));
  perform public.notificar(v_op, new.id, v_msg, 'desbloqueo',
    'Un fondeador se interesó en tu factura',
    v_quien || ' quiere negociar y puede escribirte.',
    'Ir a la conversación');
  return new;
end;
$$;

-- 3. Motivo al retirar una factura -----------------------------------------

alter table public.invoices
  add column if not exists retiro_motivo text
    check (retiro_motivo in ('cerro_con_fondeador', 'cobro_el_deudor', 'otra_via', 'ya_no_necesito', 'otro')),
  add column if not exists retiro_reveal_id uuid references public.reveals(id) on delete set null,
  add column if not exists retiro_at timestamptz;

alter table public.exceptions drop constraint if exists exceptions_tipo_check;
alter table public.exceptions add constraint exceptions_tipo_check check (tipo in (
  'pago_inconsistente', 'webhook_invalido', 'orden_desconocida', 'pago_sin_aviso',
  'pago_duplicado', 'sin_tipo_cambio', 'reclamo', 'error_tecnico', 'posible_cierre_externo'));

create or replace function public.retirar_factura(p_invoice_id uuid, p_motivo text, p_reveal_id uuid default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_inv public.invoices;
  v_room public.reveals;
  v_quien text;
begin
  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found or v_inv.operador_id is distinct from auth.uid() then
    raise exception 'Factura no encontrada';
  end if;
  if v_inv.estado <> 'disponible' then
    raise exception 'Solo se puede retirar una factura publicada';
  end if;
  if p_motivo is null or p_motivo not in ('cerro_con_fondeador', 'cobro_el_deudor', 'otra_via', 'ya_no_necesito', 'otro') then
    raise exception 'Elegí un motivo';
  end if;

  if p_reveal_id is not null then
    select * into v_room from public.reveals where id = p_reveal_id and invoice_id = p_invoice_id;
    if not found then
      raise exception 'Esa negociación no es de esta factura';
    end if;
  end if;

  update public.invoices
    set estado = 'retirada', retiro_motivo = p_motivo, retiro_reveal_id = v_room.id, retiro_at = now()
    where id = p_invoice_id;

  if p_motivo = 'cerro_con_fondeador' then
    select coalesce(nullif(p.empresa, ''), p.nombre) into v_quien from public.profiles p where p.id = v_room.fondeador_id;
    perform public.abrir_excepcion(
      'posible_cierre_externo',
      'La PyME retiró la factura y dice que la descontó un fondeador de ViaFactoring'
        || coalesce(' (' || v_quien || ')', '') || '. Corresponde cobrar la comisión de cierre.',
      v_room.id, p_invoice_id, null, null, v_room.fondeador_id,
      jsonb_build_object('monto', v_inv.monto, 'moneda', v_inv.moneda));
  end if;
end;
$$;

revoke execute on function public.retirar_factura(uuid, text, uuid) from public, anon;
grant execute on function public.retirar_factura(uuid, text, uuid) to authenticated;

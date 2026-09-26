-- ViaFactoring — 0011: información por niveles (el contacto pasa al Nivel 4)
--
-- Hasta acá `reveal_invoice` devolvía la fila ENTERA de invoices apenas se
-- confirmaba el desbloqueo, incluidos operador_contacto y deudor_contacto.
-- Desde esta migración:
--   Nivel 2 (desbloqueado): identidad, deudor, datos sectoriales, documento.
--   Nivel 4 (comisión de cierre confirmada): contacto directo.
--   El contacto del deudor solo si la oferta aceptada es con notificación
--   al deudor.
--
-- Compatible con la página actual del fondeador: `reveal_invoice` sigue
-- existiendo con los mismos nombres de campo; antes del Nivel 4 los
-- contactos vienen en null y la página muestra "No informado".
--
-- Los Deal Rooms que ya existían antes de 0007 tienen contacto_liberado_at
-- = revealed_at (ya habían visto el contacto con el modelo anterior).
--
-- Requiere 0007-0010. Es el cambio más sensible: aplicarlo último.

-- Para no llenar el audit log con cada recarga: una "vista" por persona y
-- Deal Room cada 30 minutos alcanza para la trazabilidad.
create or replace function public.vista_reciente(p_reveal_id uuid, p_accion text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.audit_logs
    where actor_id = auth.uid() and reveal_id = p_reveal_id and accion = p_accion
      and created_at > now() - interval '30 minutes'
  );
$$;

revoke execute on function public.vista_reciente(uuid, text) from public, anon, authenticated;

-- ¿Se puede mostrar el contacto del deudor en este Deal Room?
create or replace function public.deudor_contacto_visible(p_reveal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select r.contacto_liberado_at is not null
     and coalesce(
           (select o.notifica_deudor from public.offers o
             where o.reveal_id = r.id and o.estado = 'aceptada'),
           -- sin oferta aceptada pero con contacto liberado = Deal Room
           -- anterior a 0007, que ya lo había visto
           not exists (select 1 from public.offers o
                        where o.reveal_id = r.id and o.estado = 'aceptada'))
  from public.reveals r where r.id = p_reveal_id;
$$;

revoke execute on function public.deudor_contacto_visible(uuid) from public, anon, authenticated;

-- Datos de la factura según quién mira y en qué nivel está el Deal Room.
create or replace function public.invoice_json_para(p_invoice_id uuid, p_reveal_id uuid, p_es_duenio boolean)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  i public.invoices;
  v_nivel smallint;
  v_contacto boolean;
  v_deudor boolean;
begin
  select * into i from public.invoices where id = p_invoice_id;
  v_nivel := case when p_es_duenio then 4 else public.nivel_deal_room(p_reveal_id) end;
  v_contacto := p_es_duenio or v_nivel >= 4;
  v_deudor := p_es_duenio or public.deudor_contacto_visible(p_reveal_id);

  return jsonb_build_object(
    'id', i.id,
    'numero', i.numero,
    'rubro', i.rubro,
    'industry_id', i.industry_id,
    'industry_data', i.industry_data,
    'ubicacion', i.ubicacion,
    'deudor_nombre', i.deudor_nombre,
    'monto', i.monto,
    'moneda', i.moneda,
    'plazo_dias', i.plazo_dias,
    'fecha_vencimiento', i.fecha_vencimiento,
    'riesgo', i.riesgo,
    'estado', i.estado,
    'descripcion', case
       when v_contacto or cardinality(public.detectar_contacto(i.descripcion)) = 0 then i.descripcion
       end,
    -- el front actual solo usa este campo para saber si hay documento
    'documento_url', case when i.documento_url is not null then 'disponible' end,
    'operador_contacto', case when v_contacto then i.operador_contacto end,
    'deudor_contacto', case when v_deudor then i.deudor_contacto end,
    'nivel', v_nivel
  );
end;
$$;

revoke execute on function public.invoice_json_para(uuid, uuid, boolean) from public, anon, authenticated;

-- -------------------------------------------------------------------------
-- reveal_invoice: misma firma de entrada, ahora devuelve jsonb por niveles
-- -------------------------------------------------------------------------

drop function if exists public.reveal_invoice(uuid);

create function public.reveal_invoice(p_invoice_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.reveals;
begin
  if public.current_role() is distinct from 'fondeador' then
    raise exception 'Solo los fondeadores pueden ver el detalle completo';
  end if;

  select * into v_room from public.reveals
    where invoice_id = p_invoice_id and fondeador_id = auth.uid();
  if not found then
    raise exception 'Todavía no desbloqueaste esta operación';
  end if;

  if not public.vista_reciente(v_room.id, 'vista_detalle') then
    perform public.log_event('vista_detalle', p_invoice_id, v_room.id, 'invoice', p_invoice_id);
  end if;

  return public.invoice_json_para(p_invoice_id, v_room.id, false)
    || jsonb_build_object('reveal_id', v_room.id, 'deal_room_estado', v_room.estado);
end;
$$;

grant execute on function public.reveal_invoice(uuid) to authenticated;

-- -------------------------------------------------------------------------
-- get_deal_room_detail: todo lo que necesita la pantalla del Deal Room,
-- para cualquiera de las dos partes, armado según rol y nivel.
-- -------------------------------------------------------------------------

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
begin
  if v_rol is null then
    raise exception 'No sos parte de este Deal Room';
  end if;

  select * into v_room from public.reveals where id = p_reveal_id;
  select * into v_inv from public.invoices where id = v_room.invoice_id;
  v_nivel := public.nivel_deal_room(p_reveal_id);

  -- La contraparte: identidad desde el Nivel 2, contacto solo en el Nivel 4.
  if v_rol = 'fondeador' then
    select * into v_otro from public.profiles where id = v_inv.operador_id;
  else
    select * into v_otro from public.profiles where id = v_room.fondeador_id;
  end if;

  v_contraparte := jsonb_build_object('nombre', v_otro.nombre, 'empresa', v_otro.empresa);
  if v_nivel >= 4 or v_rol = 'admin' then
    v_contraparte := v_contraparte || jsonb_build_object('email', v_otro.email, 'telefono', v_otro.telefono);
  end if;

  if v_rol = 'fondeador' and not public.vista_reciente(p_reveal_id, 'vista_deal_room') then
    perform public.log_event('vista_deal_room', v_room.invoice_id, p_reveal_id, 'reveal', p_reveal_id);
  end if;

  return jsonb_build_object(
    'reveal_id', v_room.id,
    'rol', v_rol,
    'estado', v_room.estado,
    'nivel', v_nivel,
    'checklist', v_room.checklist,
    'revealed_at', v_room.revealed_at,
    'contacto_liberado_at', v_room.contacto_liberado_at,
    'cerrado_at', v_room.cerrado_at,
    'cancelado_motivo', v_room.cancelado_motivo,
    'invoice', public.invoice_json_para(v_room.invoice_id, v_room.id, v_rol in ('operador', 'admin')),
    'contraparte', v_contraparte,
    'ofertas', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', o.id, 'autor_rol', o.autor_rol, 'monto_ofrecido', o.monto_ofrecido,
               'mensaje', o.mensaje, 'estado', o.estado, 'parent_offer_id', o.parent_offer_id,
               'con_recurso', o.con_recurso, 'notifica_deudor', o.notifica_deudor,
               'fecha_pago_prevista', o.fecha_pago_prevista, 'created_at', o.created_at,
               'fondos_enviados_at', o.fondos_enviados_at, 'fondos_recibidos_at', o.fondos_recibidos_at)
             order by o.created_at)
      from public.offers o where o.reveal_id = v_room.id), '[]'::jsonb),
    'comision', (
      select jsonb_build_object('id', p.id, 'monto', p.monto, 'moneda', p.moneda,
                                'estado', p.estado, 'payment_link', p.payment_link)
      from public.payment_requests p
      join public.offers o on o.id = p.offer_id
      where o.reveal_id = v_room.id and p.tipo = 'comision'
      order by p.created_at desc limit 1)
  );
end;
$$;

grant execute on function public.get_deal_room_detail(uuid) to authenticated;

-- =========================================================================
-- ROLLBACK (vuelve al comportamiento anterior: contacto al desbloquear)
-- =========================================================================
-- drop function if exists public.get_deal_room_detail(uuid);
-- drop function if exists public.reveal_invoice(uuid);
-- (re-crear reveal_invoice con la definición de 0003)
-- drop function if exists public.invoice_json_para(uuid, uuid, boolean), public.deudor_contacto_visible(uuid),
--   public.vista_reciente(uuid, text);

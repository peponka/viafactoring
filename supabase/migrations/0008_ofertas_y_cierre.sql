-- ViaFactoring — 0008: ofertas con historial, contraofertas de las dos
-- partes, cierre por aceptación, comisión → Nivel 4, confirmación
-- declarativa de la transferencia.
--
-- Requiere 0006 y 0007.
--
-- ⚠ APLICAR JUNTO CON EL DEPLOY DEL FRONT NUEVO: a partir de acá una PyME
-- ya no puede pasar su factura a 'cerrada' con un update directo (el botón
-- "Marcar como cerrada" deja de funcionar). El cierre ocurre al aceptar una
-- oferta; el admin conserva el cierre manual como excepción registrada.
--
-- ViaFactoring sigue sin tocar el dinero del factoring: "fondos enviados" y
-- "fondos recibidos" son declaraciones de las partes, no movimientos.

-- =========================================================================
-- 1. offers: historial y contraofertas
-- =========================================================================

-- Sacar el unique(invoice_id, fondeador_id): hoy cada oferta nueva pisa la
-- anterior y se pierde el historial.
do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    where rel.relname = 'offers' and con.contype = 'u'
  loop
    execute format('alter table public.offers drop constraint %I', c.conname);
  end loop;

  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_attribute att on att.attrelid = rel.oid
    where rel.relname = 'offers' and con.contype = 'c'
      and att.attname = 'estado' and att.attnum = any(con.conkey)
  loop
    execute format('alter table public.offers drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.offers
  add constraint offers_estado_check
    check (estado in ('pendiente', 'aceptada', 'rechazada', 'reemplazada', 'cancelada')),
  add column reveal_id uuid references public.reveals(id) on delete cascade,
  add column parent_offer_id uuid references public.offers(id) on delete set null,
  add column autor_rol text not null default 'fondeador' check (autor_rol in ('fondeador', 'operador')),
  add column con_recurso boolean,
  add column notifica_deudor boolean,
  add column fecha_pago_prevista date,
  add column fondos_enviados_at timestamptz,
  add column fondos_recibidos_at timestamptz;

update public.offers o
  set reveal_id = r.id
  from public.reveals r
  where r.invoice_id = o.invoice_id and r.fondeador_id = o.fondeador_id and o.reveal_id is null;

create index offers_reveal_id_idx on public.offers(reveal_id);

-- Una sola oferta pendiente por Deal Room, y una sola aceptada por factura.
create unique index offers_una_pendiente_por_room
  on public.offers(invoice_id, fondeador_id) where estado = 'pendiente';
create unique index offers_una_aceptada_por_factura
  on public.offers(invoice_id) where estado = 'aceptada';

-- =========================================================================
-- 2. Núcleo interno: registrar una oferta nueva en un Deal Room
-- =========================================================================

-- Montos con separador de miles paraguayo (40.000), independiente del
-- locale del servidor.
create or replace function public.formato_monto(p numeric)
returns text
language sql
immutable
as $$
  select replace(to_char(round(p), 'FM999,999,999,990'), ',', '.');
$$;

create or replace function public.registrar_oferta(
  p_room public.reveals,
  p_autor_rol text,
  p_monto numeric,
  p_mensaje text,
  p_con_recurso boolean,
  p_notifica_deudor boolean,
  p_fecha_pago_prevista date
)
returns public.offers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.invoices;
  v_prev public.offers;
  v_offer public.offers;
begin
  select * into v_invoice from public.invoices where id = p_room.invoice_id for update;

  if v_invoice.estado <> 'disponible' then
    raise exception 'Esta factura ya no está disponible';
  end if;
  if p_room.estado not in ('open', 'negotiating') then
    raise exception 'En este Deal Room ya no se puede ofertar';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto ofrecido tiene que ser mayor a 0';
  end if;
  if p_monto > v_invoice.monto then
    raise exception 'El anticipo no puede superar el monto de la factura';
  end if;

  -- La oferta pendiente anterior (si hay) queda como antecedente.
  select * into v_prev from public.offers
    where invoice_id = p_room.invoice_id and fondeador_id = p_room.fondeador_id
      and estado = 'pendiente'
    for update;

  if found then
    update public.offers set estado = 'reemplazada', respondida_at = now() where id = v_prev.id;
  else
    -- sin pendiente: se encadena a la última oferta del Deal Room, si existe
    select * into v_prev from public.offers
      where invoice_id = p_room.invoice_id and fondeador_id = p_room.fondeador_id
      order by created_at desc limit 1;
  end if;

  insert into public.offers
    (invoice_id, fondeador_id, reveal_id, parent_offer_id, autor_rol, monto_ofrecido, mensaje,
     con_recurso, notifica_deudor, fecha_pago_prevista)
  values
    (p_room.invoice_id, p_room.fondeador_id, p_room.id, v_prev.id, p_autor_rol, p_monto,
     nullif(trim(p_mensaje), ''), p_con_recurso, p_notifica_deudor, p_fecha_pago_prevista)
  returning * into v_offer;

  update public.reveals set estado = 'negotiating', ultima_actividad_at = now()
    where id = p_room.id and estado = 'open';

  perform public.post_system_message(p_room.id,
    case when v_prev.id is null then 'Nueva oferta' else 'Contraoferta' end
      || case when p_autor_rol = 'fondeador' then ' del fondeador' else ' de la PyME' end
      || ': anticipo de ' || v_invoice.moneda || ' ' || public.formato_monto(p_monto),
    jsonb_build_object('offer_id', v_offer.id));

  return v_offer;
end;
$$;

revoke execute on function public.registrar_oferta(public.reveals, text, numeric, text, boolean, boolean, date)
  from public, anon, authenticated;

-- =========================================================================
-- 3. Funciones que usa el cliente
-- =========================================================================

-- El fondeador hace una oferta (o una nueva, que reemplaza la pendiente).
-- Misma firma que antes + condiciones opcionales: hacerOfertaAction sigue
-- funcionando sin cambios.
drop function if exists public.create_offer(uuid, numeric, text);

create or replace function public.create_offer(
  p_invoice_id uuid,
  p_monto_ofrecido numeric,
  p_mensaje text default null,
  p_con_recurso boolean default null,
  p_notifica_deudor boolean default null,
  p_fecha_pago_prevista date default null
)
returns public.offers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.reveals;
begin
  if public.current_role() is distinct from 'fondeador' then
    raise exception 'Solo los fondeadores pueden hacer ofertas';
  end if;

  select * into v_room from public.reveals
    where invoice_id = p_invoice_id and fondeador_id = auth.uid()
    for update;
  if not found then
    raise exception 'Tenés que desbloquear la factura antes de ofertar';
  end if;

  return public.registrar_oferta(v_room, 'fondeador', p_monto_ofrecido, p_mensaje,
                                 p_con_recurso, p_notifica_deudor, p_fecha_pago_prevista);
end;
$$;

grant execute on function public.create_offer(uuid, numeric, text, boolean, boolean, date) to authenticated;

-- Contraoferta: la hace quien RECIBIÓ la oferta pendiente (la PyME frente a
-- una oferta del fondeador, o el fondeador frente a una de la PyME).
create or replace function public.counter_offer(
  p_offer_id uuid,
  p_monto_ofrecido numeric,
  p_mensaje text default null,
  p_con_recurso boolean default null,
  p_notifica_deudor boolean default null,
  p_fecha_pago_prevista date default null
)
returns public.offers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public.offers;
  v_room public.reveals;
  v_rol text;
begin
  select * into v_offer from public.offers where id = p_offer_id;
  if not found or v_offer.estado <> 'pendiente' then
    raise exception 'Esa oferta ya no está pendiente';
  end if;

  v_rol := public.deal_room_rol(v_offer.reveal_id);
  if v_rol is null or v_rol = 'admin' then
    raise exception 'No sos parte de este Deal Room';
  end if;
  if v_rol = v_offer.autor_rol then
    raise exception 'No podés contraofertar tu propia oferta';
  end if;

  select * into v_room from public.reveals where id = v_offer.reveal_id for update;

  return public.registrar_oferta(v_room, v_rol, p_monto_ofrecido, p_mensaje,
    coalesce(p_con_recurso, v_offer.con_recurso),
    coalesce(p_notifica_deudor, v_offer.notifica_deudor),
    coalesce(p_fecha_pago_prevista, v_offer.fecha_pago_prevista));
end;
$$;

grant execute on function public.counter_offer(uuid, numeric, text, boolean, boolean, date) to authenticated;

-- Aceptar o rechazar: solo quien RECIBIÓ la oferta pendiente. Aceptar
-- cierra la factura, cancela los demás Deal Rooms y genera la comisión de
-- cierre (misma tarifa de siempre: deal_fee_for_monto).
create or replace function public.respond_offer(
  p_offer_id uuid,
  p_accept boolean
)
returns public.offers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public.offers;
  v_invoice public.invoices;
  v_rol text;
  v_fee numeric;
  v_otro record;
begin
  select * into v_offer from public.offers where id = p_offer_id for update;
  if not found then
    raise exception 'Oferta no encontrada';
  end if;
  if v_offer.estado <> 'pendiente' then
    raise exception 'Esta oferta ya fue respondida';
  end if;

  v_rol := public.deal_room_rol(v_offer.reveal_id);
  if v_rol is null or v_rol = 'admin' or v_rol = v_offer.autor_rol then
    raise exception 'Solo la otra parte del Deal Room puede responder esta oferta';
  end if;

  select * into v_invoice from public.invoices where id = v_offer.invoice_id for update;

  if not p_accept then
    update public.offers set estado = 'rechazada', respondida_at = now() where id = p_offer_id;
    perform public.post_system_message(v_offer.reveal_id,
      'Oferta rechazada por ' || case when v_rol = 'fondeador' then 'el fondeador' else 'la PyME' end || '.',
      jsonb_build_object('offer_id', p_offer_id));
    select * into v_offer from public.offers where id = p_offer_id;
    return v_offer;
  end if;

  if v_invoice.estado <> 'disponible' then
    raise exception 'Esta factura ya no está disponible';
  end if;

  update public.offers set estado = 'aceptada', respondida_at = now() where id = p_offer_id;

  -- Los demás Deal Rooms de la misma factura se cancelan.
  for v_otro in
    select r.id from public.reveals r
    where r.invoice_id = v_offer.invoice_id and r.id <> v_offer.reveal_id
      and r.estado in ('open', 'negotiating')
  loop
    update public.offers set estado = 'cancelada', respondida_at = now()
      where reveal_id = v_otro.id and estado = 'pendiente';
    update public.reveals set estado = 'cancelled', cancelado_motivo = 'cerrada_con_otro_fondeador'
      where id = v_otro.id;
    perform public.post_system_message(v_otro.id,
      'La PyME cerró esta factura con otro fondeador. Este Deal Room queda cerrado.');
  end loop;

  update public.invoices set estado = 'cerrada' where id = v_offer.invoice_id;

  update public.reveals set estado = 'offer_accepted', ultima_actividad_at = now()
    where id = v_offer.reveal_id;
  perform public.checklist_marcar(v_offer.reveal_id, 'oferta_aceptada', true, auth.uid());

  v_fee := public.deal_fee_for_monto(v_offer.monto_ofrecido);

  insert into public.payment_requests
    (fondeador_id, invoice_id, monto, moneda, tipo, offer_id, estado)
  values
    (v_offer.fondeador_id, v_offer.invoice_id, v_fee, v_invoice.moneda, 'comision', p_offer_id, 'pendiente');

  perform public.post_system_message(v_offer.reveal_id,
    'Oferta aceptada. Falta la comisión de cierre de ViaFactoring (' || v_invoice.moneda || ' '
      || public.formato_monto(v_fee) || ', a cargo del fondeador). Al confirmarse se habilita el contacto directo.',
    jsonb_build_object('offer_id', p_offer_id));

  select * into v_offer from public.offers where id = p_offer_id;
  return v_offer;
end;
$$;

grant execute on function public.respond_offer(uuid, boolean) to authenticated;

-- Retirarse de un Deal Room antes de un acuerdo.
create or replace function public.cancelar_deal_room(p_reveal_id uuid, p_motivo text default null)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text := public.deal_room_rol(p_reveal_id);
  v_room public.reveals;
begin
  if v_rol is null or v_rol = 'admin' then
    raise exception 'No sos parte de este Deal Room';
  end if;

  select * into v_room from public.reveals where id = p_reveal_id for update;
  if v_room.estado not in ('open', 'negotiating') then
    raise exception 'Este Deal Room ya no se puede cancelar';
  end if;

  update public.offers set estado = 'cancelada', respondida_at = now()
    where reveal_id = p_reveal_id and estado = 'pendiente';
  update public.reveals
    set estado = 'cancelled', cancelado_motivo = coalesce(nullif(trim(p_motivo), ''), 'retiro_' || v_rol)
    where id = p_reveal_id;

  perform public.post_system_message(p_reveal_id,
    case when v_rol = 'fondeador' then 'El fondeador' else 'La PyME' end || ' cerró este Deal Room.');
  perform public.log_event('deal_room_cancelado', v_room.invoice_id, p_reveal_id, 'reveal', p_reveal_id,
    jsonb_build_object('motivo', p_motivo, 'por', v_rol));
end;
$$;

grant execute on function public.cancelar_deal_room(uuid, text) to authenticated;

-- Confirmaciones declarativas de la transferencia (fuera de ViaFactoring).
create or replace function public.declarar_transferencia(p_offer_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_offer public.offers;
  v_room public.reveals;
  v_rol text;
begin
  select * into v_offer from public.offers where id = p_offer_id for update;
  if not found or v_offer.estado <> 'aceptada' then
    raise exception 'Solo se puede declarar la transferencia de una oferta aceptada';
  end if;

  v_rol := public.deal_room_rol(v_offer.reveal_id);
  if v_rol is null or v_rol = 'admin' then
    raise exception 'No sos parte de este Deal Room';
  end if;

  select * into v_room from public.reveals where id = v_offer.reveal_id for update;
  if v_room.estado not in ('closing', 'closed') then
    raise exception 'Primero tiene que confirmarse la comisión de cierre';
  end if;

  if v_rol = 'fondeador' then
    if v_offer.fondos_enviados_at is null then
      update public.offers set fondos_enviados_at = now() where id = p_offer_id;
      perform public.checklist_marcar(v_room.id, 'fondos_enviados', true, auth.uid());
      perform public.post_system_message(v_room.id,
        'El fondeador declaró que transfirió los fondos (transferencia directa, fuera de ViaFactoring).');
      perform public.log_event('fondos_enviados_declarados', v_offer.invoice_id, v_room.id, 'offer', p_offer_id);
    end if;
  else
    if v_offer.fondos_recibidos_at is null then
      update public.offers set fondos_recibidos_at = now() where id = p_offer_id;
      perform public.checklist_marcar(v_room.id, 'fondos_recibidos', true, auth.uid());
      perform public.post_system_message(v_room.id, 'La PyME confirmó que recibió los fondos.');
      perform public.log_event('fondos_recibidos_declarados', v_offer.invoice_id, v_room.id, 'offer', p_offer_id);
    end if;
  end if;

  select * into v_offer from public.offers where id = p_offer_id;
  if v_offer.fondos_enviados_at is not null and v_offer.fondos_recibidos_at is not null then
    update public.reveals set estado = 'closed', cerrado_at = now() where id = v_room.id;
    perform public.post_system_message(v_room.id, 'Operación cerrada. ¡Gracias por operar en ViaFactoring!');
    perform public.log_event('operacion_cerrada', v_offer.invoice_id, v_room.id, 'offer', p_offer_id);
  end if;
end;
$$;

grant execute on function public.declarar_transferencia(uuid) to authenticated;

-- =========================================================================
-- 4. confirm_payment_request: la comisión confirmada libera el Nivel 4
-- =========================================================================

-- ¿La llamada viene con la service role (por ejemplo, el webhook de pagos)?
-- Dentro de una función SECURITY DEFINER `current_user` es el dueño, así
-- que se mira el rol de la petición.
create or replace function public.es_service_role()
returns boolean
language sql
stable
as $$
  select coalesce(current_setting('role', true), '') = 'service_role'
      or coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb->>'role', '') = 'service_role';
$$;

create or replace function public.confirm_payment_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.payment_requests;
  v_pack public.credit_packs;
  v_offer public.offers;
begin
  -- Admin (confirmación manual) o service role (webhook del proveedor).
  if not public.is_admin() and not public.es_service_role() then
    raise exception 'Solo un admin puede confirmar pagos';
  end if;

  select * into v_req from public.payment_requests where id = p_request_id for update;
  if not found then
    raise exception 'Solicitud de pago no encontrada';
  end if;

  if v_req.estado = 'confirmado' then
    return;
  end if;
  if v_req.estado = 'cancelado' then
    raise exception 'Esa solicitud de pago está cancelada';
  end if;

  update public.payment_requests
    set estado = 'confirmado', confirmed_at = now(), confirmed_by = auth.uid()
    where id = p_request_id;

  if v_req.tipo = 'desbloqueo' and v_req.invoice_id is not null then
    insert into public.reveals (invoice_id, fondeador_id)
      values (v_req.invoice_id, v_req.fondeador_id)
      on conflict (invoice_id, fondeador_id) do nothing;
    return;
  end if;

  if v_req.tipo = 'comision' then
    select * into v_offer from public.offers where id = v_req.offer_id;
    if v_offer.reveal_id is not null then
      update public.reveals
        set estado = 'closing', contacto_liberado_at = coalesce(contacto_liberado_at, now()),
            ultima_actividad_at = now()
        where id = v_offer.reveal_id and estado = 'offer_accepted';
      perform public.checklist_marcar(v_offer.reveal_id, 'comision_pagada', true, auth.uid());
      perform public.post_system_message(v_offer.reveal_id,
        'Comisión de cierre confirmada. Ya pueden ver el contacto directo de la otra parte para formalizar la cesión.');
      perform public.log_event('contacto_liberado', v_offer.invoice_id, v_offer.reveal_id, 'reveal', v_offer.reveal_id);
    end if;
    return;
  end if;

  -- tipo = 'creditos' (flujo viejo, intacto)
  if v_req.pack_id is not null then
    select * into v_pack from public.credit_packs where id = v_req.pack_id;
  end if;

  insert into public.fondeador_credits (fondeador_id, balance)
    values (v_req.fondeador_id, coalesce(v_pack.cantidad_creditos, 0))
  on conflict (fondeador_id) do update
    set balance = public.fondeador_credits.balance + coalesce(v_pack.cantidad_creditos, 0),
        updated_at = now();

  insert into public.credit_transactions (fondeador_id, tipo, cantidad, admin_note, created_by)
    values (v_req.fondeador_id, 'compra', coalesce(v_pack.cantidad_creditos, 0),
            'Pago confirmado: ' || coalesce(v_pack.nombre, 'pack'), auth.uid());
end;
$$;

-- =========================================================================
-- 5. Reglas sobre invoices (decisión: cierre solo por oferta aceptada)
-- =========================================================================

-- SECURITY INVOKER a propósito: así `current_user` es quien hace el update.
-- Un update directo del cliente llega como 'authenticated'; los que hacen
-- las funciones SECURITY DEFINER (respond_offer, etc.) llegan como el dueño.
create or replace function public.invoices_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user not in ('anon', 'authenticated') or public.is_admin() then
    return new;
  end if;

  if new.estado is distinct from old.estado
     and not (old.estado = 'disponible' and new.estado = 'retirada') then
    raise exception 'Una factura se cierra aceptando una oferta en su Deal Room';
  end if;

  -- Con al menos un Deal Room abierto, los datos económicos quedan
  -- congelados: el fondeador pagó el desbloqueo sobre esos datos.
  if exists (select 1 from public.reveals where invoice_id = old.id)
     and (new.monto, new.moneda, new.deudor_nombre, new.plazo_dias, new.fecha_vencimiento)
         is distinct from (old.monto, old.moneda, old.deudor_nombre, old.plazo_dias, old.fecha_vencimiento) then
    raise exception 'No se pueden cambiar monto, deudor, plazo ni vencimiento después de un desbloqueo';
  end if;

  return new;
end;
$$;

create trigger invoices_guard_trg
  before update on public.invoices
  for each row execute function public.invoices_guard();

-- Si la PyME retira la factura (o el admin la cierra sin oferta aceptada),
-- los Deal Rooms en curso se cancelan con aviso.
create or replace function public.invoices_estado_efectos()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room record;
begin
  if new.estado is distinct from old.estado
     and new.estado in ('retirada', 'cerrada')
     and not exists (select 1 from public.offers where invoice_id = new.id and estado = 'aceptada') then
    for v_room in
      select id from public.reveals where invoice_id = new.id and estado in ('open', 'negotiating')
    loop
      update public.offers set estado = 'cancelada', respondida_at = now()
        where reveal_id = v_room.id and estado = 'pendiente';
      update public.reveals set estado = 'cancelled', cancelado_motivo = 'factura_' || new.estado
        where id = v_room.id;
      perform public.post_system_message(v_room.id,
        case when new.estado = 'retirada' then 'La PyME retiró esta factura del marketplace.'
             else 'La factura fue cerrada por administración.' end);
    end loop;
  end if;
  return new;
end;
$$;

create trigger invoices_estado_efectos_trg
  after update on public.invoices
  for each row execute function public.invoices_estado_efectos();

revoke execute on function public.invoices_guard() from public, anon, authenticated;
revoke execute on function public.invoices_estado_efectos() from public, anon, authenticated;

-- =========================================================================
-- ROLLBACK
-- =========================================================================
-- drop trigger if exists invoices_estado_efectos_trg on public.invoices;
-- drop trigger if exists invoices_guard_trg on public.invoices;
-- drop function if exists public.invoices_estado_efectos(), public.invoices_guard();
-- drop function if exists public.declarar_transferencia(uuid), public.cancelar_deal_room(uuid, text),
--   public.counter_offer(uuid, numeric, text, boolean, boolean, date),
--   public.registrar_oferta(public.reveals, text, numeric, text, boolean, boolean, date);
-- (create_offer, respond_offer y confirm_payment_request: re-ejecutar sus
--  versiones de 0002/0003 si hiciera falta volver atrás)
-- drop index if exists public.offers_una_pendiente_por_room, public.offers_una_aceptada_por_factura;
-- alter table public.offers drop column reveal_id, drop column parent_offer_id, drop column autor_rol,
--   drop column con_recurso, drop column notifica_deudor, drop column fecha_pago_prevista,
--   drop column fondos_enviados_at, drop column fondos_recibidos_at;

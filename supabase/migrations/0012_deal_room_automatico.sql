-- ViaFactoring — 0012: Deal Room automático
--
-- El flujo normal deja de depender del admin:
--   * los pagos (desbloqueo y comisión) se confirman por el webhook de la
--     pasarela, verificado en el servidor (payment_events + aplicar_resultado_pago);
--   * las tarifas siguen definidas en USD y se cobran en guaraníes con la
--     cotización del día, congelada en la orden (fx_rates);
--   * cada evento se ve en el chat como tarjeta (messages.meta.kind) y genera
--     una notificación que lleva al punto exacto del Deal Room;
--   * ofertas y comisión vencen solas (vencer_y_recordar, cada 10 minutos);
--   * la franja "Ahora te toca a vos" la calcula la base (turno_deal_room);
--   * el admin solo trabaja sobre la bandeja de excepciones.
--
-- ViaFactoring sigue sin tocar el dinero del factoring: no hay saldos, ni
-- custodia, ni movimientos del anticipo. Solo se cobran las tarifas propias.
--
-- Todo es aditivo. Requiere 0006-0011. Rollback al final.

-- =========================================================================
-- 0. Parámetros (ajustables sin migración)
-- =========================================================================

insert into public.app_config (key, value) values
  ('oferta_horas_vencimiento', '72'),
  ('comision_dias_vencimiento', '7'),
  ('orden_pago_horas_vencimiento', '24'),
  ('tipo_cambio_max_dias', '3')
on conflict (key) do nothing;

create or replace function public.config_num(p_key text, p_default numeric)
returns numeric
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select trim(both '"' from value)::numeric from public.app_config where key = p_key), p_default);
$$;

revoke execute on function public.config_num(text, numeric) from public, anon, authenticated;

-- =========================================================================
-- 1. Tipo de cambio y tarifas en guaraníes
-- =========================================================================

create table public.fx_rates (
  fecha date not null,
  moneda text not null default 'USD' check (moneda in ('USD')),
  pyg_por_unidad numeric(14, 4) not null check (pyg_por_unidad > 0),
  fuente text not null,
  created_at timestamptz not null default now(),
  primary key (fecha, moneda)
);

alter table public.fx_rates enable row level security;
create policy "fx_rates_select" on public.fx_rates for select to authenticated using (true);
revoke insert, update, delete, truncate on public.fx_rates from anon, authenticated;

-- Cotización vigente (la más reciente de los últimos N días) o null.
create or replace function public.tipo_cambio_vigente()
returns public.fx_rates
language sql
stable
security definer
set search_path = public
as $$
  select * from public.fx_rates
  where moneda = 'USD'
    and fecha >= current_date - public.config_num('tipo_cambio_max_dias', 3)::int
  order by fecha desc
  limit 1;
$$;

-- Monto expresado en USD (para ubicar el tramo de la escala). Null si la
-- factura está en guaraníes y no hay cotización vigente.
create or replace function public.monto_en_usd(p_monto numeric, p_moneda text)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_fx public.fx_rates;
begin
  if p_moneda = 'USD' then
    return p_monto;
  end if;
  if p_moneda = 'PYG' then
    v_fx := public.tipo_cambio_vigente();
    if v_fx.pyg_por_unidad is null then
      return null;
    end if;
    return round(p_monto / v_fx.pyg_por_unidad, 2);
  end if;
  return null;
end;
$$;

grant execute on function public.monto_en_usd(numeric, text) to authenticated;

-- =========================================================================
-- 2. payment_requests: órdenes de pago reales
-- =========================================================================

alter table public.payment_requests drop constraint if exists payment_requests_estado_check;
alter table public.payment_requests
  add constraint payment_requests_estado_check
    check (estado in ('pendiente', 'procesando', 'confirmado', 'fallido', 'rechazado',
                      'vencido', 'devuelto', 'cancelado')),
  add column provider text,
  add column provider_ref text,
  add column checkout_url text,
  add column expires_at timestamptz,
  add column paid_at timestamptz,
  add column reveal_id uuid references public.reveals(id) on delete set null,
  add column monto_usd numeric(12, 2),
  add column moneda_cobro text,
  add column monto_cobro numeric(14, 2),
  add column tipo_cambio numeric(14, 4),
  add column tipo_cambio_fecha date,
  add column updated_at timestamptz not null default now();

create unique index payment_requests_provider_ref_uidx
  on public.payment_requests(provider, provider_ref) where provider_ref is not null;

-- Una sola orden abierta por concepto (desbloqueo de una factura, o
-- comisión de una oferta) y fondeador.
create unique index payment_requests_una_abierta_uidx
  on public.payment_requests(tipo, fondeador_id, coalesce(offer_id, invoice_id))
  where estado in ('pendiente', 'procesando') and tipo in ('desbloqueo', 'comision');

update public.payment_requests p set reveal_id = o.reveal_id
  from public.offers o
  where p.tipo = 'comision' and p.offer_id = o.id and p.reveal_id is null;
update public.payment_requests set monto_usd = monto where moneda = 'USD' and monto_usd is null;

-- Desde el navegador no se crea ni se modifica ninguna orden: todo pasa por
-- funciones del servidor. (El insert de packs de créditos estaba inactivo.)
drop policy if exists "payment_requests_insert_own" on public.payment_requests;
drop policy if exists "payment_requests_admin_update" on public.payment_requests;
revoke insert, update, delete, truncate on public.payment_requests from anon, authenticated;

-- La confirmación manual deja de estar disponible para el cliente. Queda
-- solo para la service role; el admin usa admin_aplicar_pago_verificado.
revoke execute on function public.confirm_payment_request(uuid) from public, anon, authenticated;
revoke execute on function public.solicitar_desbloqueo(uuid) from public, anon, authenticated;

-- =========================================================================
-- 3. Bandeja de webhooks y excepciones
-- =========================================================================

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  dedupe_key text not null,
  provider_ref text,
  estado_informado text,
  monto numeric(14, 2),
  moneda text,
  firma_valida boolean not null,
  payload jsonb not null default '{}'::jsonb,
  payment_request_id uuid references public.payment_requests(id) on delete set null,
  resultado text,
  error text,
  recibido_at timestamptz not null default now(),
  procesado_at timestamptz,
  unique (provider, dedupe_key)
);

alter table public.payment_events enable row level security;
create policy "payment_events_select_admin" on public.payment_events
  for select to authenticated using (public.is_admin());
revoke insert, update, delete, truncate on public.payment_events from anon, authenticated;

create table public.exceptions (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in (
    'pago_inconsistente', 'webhook_invalido', 'orden_desconocida', 'pago_sin_aviso',
    'pago_duplicado', 'sin_tipo_cambio', 'reclamo', 'error_tecnico')),
  estado text not null default 'abierta' check (estado in ('abierta', 'resuelta', 'descartada')),
  reveal_id uuid references public.reveals(id) on delete set null,
  invoice_id uuid references public.invoices(id) on delete set null,
  payment_request_id uuid references public.payment_requests(id) on delete set null,
  payment_event_id uuid references public.payment_events(id) on delete set null,
  user_id uuid references public.profiles(id) on delete set null,
  detalle text not null,
  datos jsonb not null default '{}'::jsonb,
  resolucion text,
  resuelta_por uuid references public.profiles(id) on delete set null,
  resuelta_at timestamptz,
  created_at timestamptz not null default now()
);

create index exceptions_estado_idx on public.exceptions(estado, created_at desc);

alter table public.exceptions enable row level security;
create policy "exceptions_select_admin" on public.exceptions
  for select to authenticated using (public.is_admin());
revoke insert, update, delete, truncate on public.exceptions from anon, authenticated;

create or replace function public.abrir_excepcion(
  p_tipo text,
  p_detalle text,
  p_reveal_id uuid default null,
  p_invoice_id uuid default null,
  p_payment_request_id uuid default null,
  p_payment_event_id uuid default null,
  p_user_id uuid default null,
  p_datos jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  -- No duplicar la misma excepción abierta para la misma orden y tipo.
  if p_payment_request_id is not null then
    select id into v_id from public.exceptions
      where payment_request_id = p_payment_request_id and tipo = p_tipo and estado = 'abierta';
    if found then
      return v_id;
    end if;
  elsif p_tipo = 'sin_tipo_cambio' then
    -- Falta de cotización: una sola abierta alcanza.
    select id into v_id from public.exceptions where tipo = p_tipo and estado = 'abierta' limit 1;
    if found then
      return v_id;
    end if;
  elsif p_tipo <> 'reclamo' then
    select id into v_id from public.exceptions
      where tipo = p_tipo and estado = 'abierta' and payment_request_id is null
        and reveal_id is not distinct from p_reveal_id
        and invoice_id is not distinct from p_invoice_id
        and user_id is not distinct from p_user_id
      limit 1;
    if found then
      return v_id;
    end if;
  end if;

  insert into public.exceptions
    (tipo, detalle, reveal_id, invoice_id, payment_request_id, payment_event_id, user_id, datos)
  values
    (p_tipo, p_detalle, p_reveal_id, p_invoice_id, p_payment_request_id, p_payment_event_id,
     p_user_id, coalesce(p_datos, '{}'::jsonb))
  returning id into v_id;

  perform public.log_event('excepcion_abierta', p_invoice_id, p_reveal_id, 'exception', v_id,
    jsonb_build_object('tipo', p_tipo));
  return v_id;
end;
$$;

revoke execute on function public.abrir_excepcion(text, text, uuid, uuid, uuid, uuid, uuid, jsonb)
  from public, anon, authenticated;

-- =========================================================================
-- 4. Notificaciones
-- =========================================================================

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reveal_id uuid references public.reveals(id) on delete cascade,
  message_id uuid references public.messages(id) on delete set null,
  tipo text not null,
  titulo text not null,
  cuerpo text,
  accion_label text not null default 'Ir a la conversación',
  url text not null,
  cantidad int not null default 1,
  clave text,
  leida_at timestamptz,
  email_estado text not null default 'pendiente'
    check (email_estado in ('pendiente', 'enviado', 'omitido', 'error')),
  email_enviado_at timestamptz,
  whatsapp_estado text not null default 'omitido'
    check (whatsapp_estado in ('pendiente', 'enviado', 'omitido', 'error')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notifications_user_idx on public.notifications(user_id, created_at desc);
create index notifications_email_pend_idx on public.notifications(email_estado, created_at)
  where email_estado = 'pendiente';
create unique index notifications_clave_uidx on public.notifications(user_id, clave) where clave is not null;

alter table public.notifications enable row level security;
create policy "notifications_select_own" on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "notifications_update_own" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke insert, update, delete, truncate on public.notifications from anon, authenticated;
grant update (leida_at) on public.notifications to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

create table public.notification_prefs (
  user_id uuid primary key references public.profiles(id) on delete cascade,
  email boolean not null default true,
  whatsapp boolean not null default false,
  whatsapp_numero text,
  updated_at timestamptz not null default now()
);

alter table public.notification_prefs enable row level security;
create policy "notification_prefs_own" on public.notification_prefs
  for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke delete, truncate on public.notification_prefs from anon, authenticated;
revoke insert, update on public.notification_prefs from anon, authenticated;
grant insert (user_id, email), update (email) on public.notification_prefs to authenticated;

-- Crea (o agrupa) una notificación. Interno.
create or replace function public.notificar(
  p_user_id uuid,
  p_reveal_id uuid,
  p_message_id uuid,
  p_tipo text,
  p_titulo text,
  p_cuerpo text default null,
  p_accion text default 'Ir a la conversación',
  p_clave text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existente public.notifications;
  v_url text := case when p_reveal_id is null then '/fondeador/deal-rooms'
                     else '/deal-room/' || p_reveal_id::text
                          || case when p_message_id is not null then '#m-' || p_message_id::text else '' end
                end;
begin
  if p_user_id is null then
    return;
  end if;

  -- Mensajes seguidos: un solo aviso ("Tenés 3 mensajes nuevos").
  if p_tipo = 'mensaje' then
    select * into v_existente from public.notifications
      where user_id = p_user_id and reveal_id = p_reveal_id and tipo = 'mensaje'
        and leida_at is null and email_estado = 'pendiente'
        and created_at > now() - interval '10 minutes'
      order by created_at desc limit 1
      for update;
    if found then
      update public.notifications
        set cantidad = cantidad + 1,
            titulo = 'Tenés ' || (cantidad + 1) || ' mensajes nuevos',
            updated_at = now()
        where id = v_existente.id;
      return;
    end if;
  end if;

  insert into public.notifications
    (user_id, reveal_id, message_id, tipo, titulo, cuerpo, accion_label, url, clave, email_estado)
  values
    (p_user_id, p_reveal_id, p_message_id, p_tipo, p_titulo, p_cuerpo, p_accion, v_url, p_clave,
     case when coalesce((select email from public.notification_prefs where user_id = p_user_id), true)
          then 'pendiente' else 'omitido' end)
  on conflict (user_id, clave) where clave is not null do nothing;
end;
$$;

revoke execute on function public.notificar(uuid, uuid, uuid, text, text, text, text, text)
  from public, anon, authenticated;

-- Participantes de un Deal Room
create or replace function public.deal_room_partes(p_reveal_id uuid, out fondeador_id uuid, out operador_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  select r.fondeador_id, i.operador_id
  from public.reveals r join public.invoices i on i.id = r.invoice_id
  where r.id = p_reveal_id;
$$;

revoke execute on function public.deal_room_partes(uuid) from public, anon, authenticated;

-- Mensaje del sistema que además devuelve su id (para las notificaciones).
create or replace function public.evento_chat(p_reveal_id uuid, p_cuerpo text, p_meta jsonb default '{}'::jsonb)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.messages (reveal_id, invoice_id, autor_id, autor_rol, tipo, cuerpo, meta)
  select r.id, r.invoice_id, null, 'sistema', 'sistema', p_cuerpo, coalesce(p_meta, '{}'::jsonb)
  from public.reveals r where r.id = p_reveal_id
  returning id into v_id;

  update public.reveals set ultima_actividad_at = now() where id = p_reveal_id;
  return v_id;
end;
$$;

revoke execute on function public.evento_chat(uuid, text, jsonb) from public, anon, authenticated;

-- Cada mensaje o documento de una parte avisa a la otra.
create or replace function public.messages_notificar()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_p record;
  v_dest uuid;
  v_de text;
begin
  if new.autor_rol not in ('fondeador', 'operador') then
    return new;
  end if;
  select * into v_p from public.deal_room_partes(new.reveal_id);
  v_dest := case when new.autor_rol = 'fondeador' then v_p.operador_id else v_p.fondeador_id end;
  v_de := case when new.autor_rol = 'fondeador' then 'el fondeador' else 'la PyME' end;

  if new.document_id is not null then
    perform public.notificar(v_dest, new.reveal_id, new.id, 'documento',
      'Hay un documento nuevo', 'Lo compartió ' || v_de || '.', 'Ver documento');
  else
    perform public.notificar(v_dest, new.reveal_id, new.id, 'mensaje',
      'Tenés un mensaje nuevo', 'Te escribió ' || v_de || '.', 'Responder');
  end if;
  return new;
end;
$$;

create trigger messages_notificar_trg
  after insert on public.messages
  for each row execute function public.messages_notificar();

revoke execute on function public.messages_notificar() from public, anon, authenticated;

-- Abrir el Deal Room marca como leídas sus notificaciones.
create or replace function public.marcar_leidos(p_reveal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text := public.deal_room_rol(p_reveal_id);
begin
  if v_rol is null or v_rol = 'admin' then
    raise exception 'No sos parte de este Deal Room';
  end if;

  update public.messages
    set leido_at = now()
    where reveal_id = p_reveal_id and leido_at is null and autor_rol <> v_rol;

  update public.notifications
    set leida_at = now(), updated_at = now(),
        email_estado = case when email_estado = 'pendiente' and tipo = 'mensaje' then 'omitido' else email_estado end
    where user_id = auth.uid() and reveal_id = p_reveal_id and leida_at is null;
end;
$$;

-- =========================================================================
-- 5. Ofertas: vencimiento y tarjetas en el chat
-- =========================================================================

alter table public.offers drop constraint if exists offers_estado_check;
alter table public.offers
  add constraint offers_estado_check
    check (estado in ('pendiente', 'aceptada', 'rechazada', 'reemplazada', 'cancelada', 'expirada')),
  add column expira_at timestamptz;

alter table public.reveals add column comision_vence_at timestamptz;

create or replace function public.quien(p_rol text)
returns text
language sql
immutable
as $$
  select case when p_rol = 'fondeador' then 'El fondeador' else 'La PyME' end;
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
  v_msg uuid;
  v_p record;
  v_contra boolean;
begin
  select * into v_invoice from public.invoices where id = p_room.invoice_id for update;

  if v_invoice.estado <> 'disponible' then
    raise exception 'Esta factura ya no está disponible';
  end if;
  if p_room.estado not in ('open', 'negotiating') then
    raise exception 'En esta negociación ya no se puede ofertar';
  end if;
  if p_monto is null or p_monto <= 0 then
    raise exception 'El monto ofrecido tiene que ser mayor a 0';
  end if;
  if p_monto > v_invoice.monto then
    raise exception 'El anticipo no puede superar el monto de la factura';
  end if;

  select * into v_prev from public.offers
    where invoice_id = p_room.invoice_id and fondeador_id = p_room.fondeador_id
      and estado = 'pendiente'
    for update;

  v_contra := found;
  if found then
    update public.offers set estado = 'reemplazada', respondida_at = now() where id = v_prev.id;
  else
    select * into v_prev from public.offers
      where invoice_id = p_room.invoice_id and fondeador_id = p_room.fondeador_id
      order by created_at desc limit 1;
  end if;

  insert into public.offers
    (invoice_id, fondeador_id, reveal_id, parent_offer_id, autor_rol, monto_ofrecido, mensaje,
     con_recurso, notifica_deudor, fecha_pago_prevista, expira_at)
  values
    (p_room.invoice_id, p_room.fondeador_id, p_room.id, v_prev.id, p_autor_rol, p_monto,
     nullif(trim(p_mensaje), ''), p_con_recurso, p_notifica_deudor, p_fecha_pago_prevista,
     now() + make_interval(hours => public.config_num('oferta_horas_vencimiento', 72)::int))
  returning * into v_offer;

  update public.reveals set estado = 'negotiating', ultima_actividad_at = now()
    where id = p_room.id and estado = 'open';

  v_msg := public.evento_chat(p_room.id,
    case when v_contra and v_prev.autor_rol <> p_autor_rol then '🔄 Contraoferta' else '💰 Oferta' end
      || ': ' || v_invoice.moneda || ' ' || public.formato_monto(p_monto),
    jsonb_build_object('kind', 'oferta', 'offer_id', v_offer.id, 'autor_rol', p_autor_rol));

  select * into v_p from public.deal_room_partes(p_room.id);
  perform public.notificar(
    case when p_autor_rol = 'fondeador' then v_p.operador_id else v_p.fondeador_id end,
    p_room.id, v_msg, 'oferta',
    'Tenés una nueva oferta',
    public.quien(p_autor_rol) || ' propone un anticipo de ' || v_invoice.moneda || ' '
      || public.formato_monto(p_monto) || '.',
    'Ver oferta');

  return v_offer;
end;
$$;

revoke execute on function public.registrar_oferta(public.reveals, text, numeric, text, boolean, boolean, date)
  from public, anon, authenticated;

-- Aceptar o rechazar. Aceptar crea la comisión (en USD; se congela en
-- guaraníes cuando el fondeador inicia el pago) y le da 7 días para pagarla.
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
  v_msg uuid;
  v_p record;
  v_req uuid;
begin
  select * into v_offer from public.offers where id = p_offer_id for update;
  if not found then
    raise exception 'Oferta no encontrada';
  end if;
  if v_offer.estado <> 'pendiente' then
    raise exception 'Esta oferta ya fue respondida';
  end if;
  if v_offer.expira_at is not null and v_offer.expira_at < now() then
    raise exception 'Esta oferta venció. Pueden hacer una nueva';
  end if;

  v_rol := public.deal_room_rol(v_offer.reveal_id);
  if v_rol is null or v_rol = 'admin' or v_rol = v_offer.autor_rol then
    raise exception 'Solo la otra parte puede responder esta oferta';
  end if;

  select * into v_invoice from public.invoices where id = v_offer.invoice_id for update;
  select * into v_p from public.deal_room_partes(v_offer.reveal_id);

  if not p_accept then
    update public.offers set estado = 'rechazada', respondida_at = now() where id = p_offer_id;
    v_msg := public.evento_chat(v_offer.reveal_id,
      '✖ ' || public.quien(v_rol) || ' rechazó la oferta de ' || v_invoice.moneda || ' '
        || public.formato_monto(v_offer.monto_ofrecido) || '. La negociación sigue abierta.',
      jsonb_build_object('kind', 'oferta_rechazada', 'offer_id', p_offer_id));
    perform public.notificar(
      case when v_offer.autor_rol = 'fondeador' then v_p.fondeador_id else v_p.operador_id end,
      v_offer.reveal_id, v_msg, 'oferta_rechazada', 'Tu oferta fue rechazada',
      'Pueden seguir negociando en la conversación.');
    select * into v_offer from public.offers where id = p_offer_id;
    return v_offer;
  end if;

  if v_invoice.estado <> 'disponible' then
    raise exception 'Esta factura ya no está disponible';
  end if;

  update public.offers set estado = 'aceptada', respondida_at = now() where id = p_offer_id;

  for v_otro in
    select r.id, r.fondeador_id from public.reveals r
    where r.invoice_id = v_offer.invoice_id and r.id <> v_offer.reveal_id
      and r.estado in ('open', 'negotiating')
  loop
    update public.offers set estado = 'cancelada', respondida_at = now()
      where reveal_id = v_otro.id and estado = 'pendiente';
    update public.reveals set estado = 'cancelled', cancelado_motivo = 'cerrada_con_otro_fondeador'
      where id = v_otro.id;
    v_msg := public.evento_chat(v_otro.id,
      'La PyME aceptó otra oferta por esta factura. Esta negociación queda cerrada.',
      jsonb_build_object('kind', 'cerrada'));
    perform public.notificar(v_otro.fondeador_id, v_otro.id, v_msg, 'negociacion_cerrada',
      'Una negociación se cerró', 'La PyME aceptó otra oferta por esa factura.');
  end loop;

  update public.invoices set estado = 'cerrada' where id = v_offer.invoice_id;

  update public.reveals
    set estado = 'offer_accepted', ultima_actividad_at = now(),
        comision_vence_at = now() + make_interval(days => public.config_num('comision_dias_vencimiento', 7)::int)
    where id = v_offer.reveal_id;
  perform public.checklist_marcar(v_offer.reveal_id, 'oferta_aceptada', true, auth.uid());

  v_fee := public.deal_fee_for_monto(public.monto_en_usd(v_offer.monto_ofrecido, v_invoice.moneda));
  if v_fee is null or v_fee = 0 then
    -- Sin cotización para una factura en guaraníes: se calcula al pagar.
    v_fee := null;
  end if;

  insert into public.payment_requests
    (fondeador_id, invoice_id, reveal_id, monto, moneda, monto_usd, tipo, offer_id, estado)
  values
    (v_offer.fondeador_id, v_offer.invoice_id, v_offer.reveal_id, coalesce(v_fee, 0), 'USD', v_fee,
     'comision', p_offer_id, 'pendiente')
  returning id into v_req;

  perform public.evento_chat(v_offer.reveal_id,
    '✅ Oferta aceptada: ' || v_invoice.moneda || ' ' || public.formato_monto(v_offer.monto_ofrecido),
    jsonb_build_object('kind', 'oferta_aceptada', 'offer_id', p_offer_id));
  v_msg := public.evento_chat(v_offer.reveal_id,
    '💳 Falta un último paso: el fondeador paga la comisión de ViaFactoring para liberar el contacto.',
    jsonb_build_object('kind', 'comision', 'offer_id', p_offer_id, 'payment_request_id', v_req));

  perform public.notificar(v_p.fondeador_id, v_offer.reveal_id, v_msg, 'oferta_aceptada',
    'Aceptaron tu oferta: falta un último paso',
    'Pagá la comisión de ViaFactoring para ver el contacto de la PyME.', 'Pagar comisión');
  perform public.notificar(v_p.operador_id, v_offer.reveal_id, v_msg, 'oferta_aceptada',
    'Oferta aceptada',
    'Cuando el fondeador pague la comisión vas a ver su contacto para coordinar la transferencia.',
    'Ver conversación');
  -- quien aceptó fue una de las dos partes; si fue el fondeador, igual recibe
  -- el aviso de pagar (es su acción pendiente).

  select * into v_offer from public.offers where id = p_offer_id;
  return v_offer;
end;
$$;

grant execute on function public.respond_offer(uuid, boolean) to authenticated;

-- Desembolso: solo declaraciones de las partes; con las dos, finaliza.
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
  v_msg uuid;
  v_p record;
begin
  select * into v_offer from public.offers where id = p_offer_id for update;
  if not found or v_offer.estado <> 'aceptada' then
    raise exception 'Solo se puede declarar la transferencia de una oferta aceptada';
  end if;

  v_rol := public.deal_room_rol(v_offer.reveal_id);
  if v_rol is null or v_rol = 'admin' then
    raise exception 'No sos parte de esta negociación';
  end if;

  select * into v_room from public.reveals where id = v_offer.reveal_id for update;
  if v_room.estado not in ('closing', 'closed') or v_room.contacto_liberado_at is null then
    raise exception 'Primero tiene que pagarse la comisión';
  end if;
  select * into v_p from public.deal_room_partes(v_room.id);

  if v_rol = 'fondeador' then
    if v_offer.fondos_enviados_at is null then
      update public.offers set fondos_enviados_at = now() where id = p_offer_id;
      perform public.checklist_marcar(v_room.id, 'fondos_enviados', true, auth.uid());
      v_msg := public.evento_chat(v_room.id,
        '💸 El fondeador indicó que envió los fondos (transferencia directa, fuera de ViaFactoring).',
        jsonb_build_object('kind', 'desembolso', 'lado', 'envio'));
      perform public.notificar(v_p.operador_id, v_room.id, v_msg, 'desembolso',
        'El fondeador indicó que envió los fondos', 'Cuando te lleguen, confirmalo en la conversación.',
        'Confirmar recepción');
      perform public.log_event('fondos_enviados_declarados', v_offer.invoice_id, v_room.id, 'offer', p_offer_id);
    end if;
  else
    if v_offer.fondos_recibidos_at is null then
      update public.offers set fondos_recibidos_at = now() where id = p_offer_id;
      perform public.checklist_marcar(v_room.id, 'fondos_recibidos', true, auth.uid());
      v_msg := public.evento_chat(v_room.id, '💸 La PyME confirmó que recibió los fondos.',
        jsonb_build_object('kind', 'desembolso', 'lado', 'recepcion'));
      perform public.notificar(v_p.fondeador_id, v_room.id, v_msg, 'desembolso',
        'La PyME confirmó que recibió los fondos', null, 'Ver conversación');
      perform public.log_event('fondos_recibidos_declarados', v_offer.invoice_id, v_room.id, 'offer', p_offer_id);
    end if;
  end if;

  select * into v_offer from public.offers where id = p_offer_id;
  if v_offer.fondos_enviados_at is not null and v_offer.fondos_recibidos_at is not null
     and v_room.estado <> 'closed' then
    update public.reveals set estado = 'closed', cerrado_at = now() where id = v_room.id;
    v_msg := public.evento_chat(v_room.id, '✅ Operación finalizada.', jsonb_build_object('kind', 'fin'));
    perform public.notificar(v_p.fondeador_id, v_room.id, v_msg, 'fin', 'Operación finalizada', null, 'Ver conversación');
    perform public.notificar(v_p.operador_id, v_room.id, v_msg, 'fin', 'Operación finalizada', null, 'Ver conversación');
    perform public.log_event('operacion_cerrada', v_offer.invoice_id, v_room.id, 'offer', p_offer_id);
  end if;
end;
$$;

grant execute on function public.declarar_transferencia(uuid) to authenticated;

-- Al abrirse un Deal Room: evento de desbloqueo + aviso a la PyME.
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
    '🔓 ' || coalesce(v_quien, 'Un fondeador') || ' desbloqueó la oportunidad. '
      || 'Pueden conversar, compartir documentos y negociar acá mismo.',
    jsonb_build_object('kind', 'desbloqueo'));
  perform public.notificar(v_op, new.id, v_msg, 'desbloqueo',
    'Un fondeador quiere negociar tu factura',
    coalesce(v_quien, 'Un fondeador') || ' desbloqueó tu factura y puede escribirte.',
    'Ir a la conversación');
  return new;
end;
$$;

-- =========================================================================
-- 6. Pagos: preparar la orden, aplicar el resultado de la pasarela
-- =========================================================================

-- Efectos de un pago confirmado. Interno: lo llaman aplicar_resultado_pago
-- (webhook verificado) y admin_aplicar_pago_verificado (excepción).
create or replace function public.efectos_pago_confirmado(p_request_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.payment_requests;
  v_offer public.offers;
  v_room public.reveals;
  v_msg uuid;
  v_p record;
begin
  select * into v_req from public.payment_requests where id = p_request_id;

  if v_req.tipo = 'desbloqueo' then
    if exists (select 1 from public.reveals where invoice_id = v_req.invoice_id and fondeador_id = v_req.fondeador_id) then
      return 'ya_desbloqueado';
    end if;
    insert into public.reveals (invoice_id, fondeador_id)
      values (v_req.invoice_id, v_req.fondeador_id)
      returning * into v_room;
    update public.payment_requests set reveal_id = v_room.id where id = p_request_id;
    perform public.notificar(v_req.fondeador_id, v_room.id, null, 'desbloqueo_pagado',
      'Tu pago se confirmó', 'Ya podés conversar con la PyME.', 'Ir a la conversación');
    return 'deal_room_abierto';
  end if;

  if v_req.tipo = 'comision' then
    select * into v_offer from public.offers where id = v_req.offer_id;
    select * into v_room from public.reveals where id = v_offer.reveal_id for update;
    if v_room.contacto_liberado_at is not null then
      return 'contacto_ya_liberado';
    end if;
    update public.reveals
      set estado = 'closing', contacto_liberado_at = now(), comision_vence_at = null,
          ultima_actividad_at = now()
      where id = v_room.id;
    perform public.checklist_marcar(v_room.id, 'comision_pagada', true, null);
    v_msg := public.evento_chat(v_room.id,
      '✅ Comisión pagada. 🔓 El contacto entre las partes quedó disponible.',
      jsonb_build_object('kind', 'contacto'));
    select * into v_p from public.deal_room_partes(v_room.id);
    perform public.notificar(v_p.fondeador_id, v_room.id, v_msg, 'contacto',
      'El contacto está disponible', 'Coordiná la transferencia con la PyME.', 'Ver conversación');
    perform public.notificar(v_p.operador_id, v_room.id, v_msg, 'contacto',
      'El contacto está disponible', 'Ya podés ver los datos del fondeador.', 'Ver conversación');
    perform public.log_event('contacto_liberado', v_offer.invoice_id, v_room.id, 'reveal', v_room.id);
    return 'contacto_liberado';
  end if;

  return 'sin_efectos';
end;
$$;

revoke execute on function public.efectos_pago_confirmado(uuid) from public, anon, authenticated;

-- ¿El concepto de esta orden sigue necesitando un pago?
create or replace function public.pago_sigue_necesario(p_req public.payment_requests)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_req.tipo = 'desbloqueo' then
    return not exists (select 1 from public.reveals where invoice_id = p_req.invoice_id and fondeador_id = p_req.fondeador_id)
       and exists (select 1 from public.invoices where id = p_req.invoice_id and estado = 'disponible')
       and not exists (select 1 from public.payment_requests x
                        where x.tipo = 'desbloqueo' and x.invoice_id = p_req.invoice_id
                          and x.fondeador_id = p_req.fondeador_id and x.estado = 'confirmado'
                          and x.id <> p_req.id);
  end if;
  if p_req.tipo = 'comision' then
    return exists (select 1 from public.offers o join public.reveals r on r.id = o.reveal_id
                   where o.id = p_req.offer_id and o.estado = 'aceptada'
                     and r.estado = 'offer_accepted' and r.contacto_liberado_at is null);
  end if;
  return false;
end;
$$;

revoke execute on function public.pago_sigue_necesario(public.payment_requests) from public, anon, authenticated;

-- Prepara la orden de pago para quien está logueado. El monto lo calcula la
-- base: tramo en USD, cotización del día, redondeo hacia arriba a Gs 1.000.
-- Devuelve la orden abierta (nueva o la que ya existía y sigue vigente).
create or replace function public.preparar_pago(p_tipo text, p_ref uuid)
returns public.payment_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_invoice public.invoices;
  v_room public.reveals;
  v_offer public.offers;
  v_req public.payment_requests;
  v_usd numeric;
  v_fx public.fx_rates;
  v_pyg numeric;
begin
  if public.current_role() is distinct from 'fondeador' then
    raise exception 'Solo el fondeador paga las tarifas de ViaFactoring';
  end if;

  if p_tipo = 'desbloqueo' then
    select * into v_invoice from public.invoices where id = p_ref for update;
    if not found then
      raise exception 'Operación no encontrada';
    end if;
    if exists (select 1 from public.reveals where invoice_id = p_ref and fondeador_id = v_uid) then
      raise exception 'Ya desbloqueaste esta operación';
    end if;
    if v_invoice.estado <> 'disponible' then
      raise exception 'Esta operación ya no está disponible';
    end if;
    select * into v_req from public.payment_requests
      where tipo = 'desbloqueo' and invoice_id = p_ref and fondeador_id = v_uid
        and estado in ('pendiente', 'procesando')
      for update;
  elsif p_tipo = 'comision' then
    select * into v_room from public.reveals where id = p_ref for update;
    if not found or v_room.fondeador_id <> v_uid then
      raise exception 'No sos parte de esta negociación';
    end if;
    if v_room.estado <> 'offer_accepted' or v_room.contacto_liberado_at is not null then
      raise exception 'No hay una comisión pendiente en esta negociación';
    end if;
    select * into v_offer from public.offers where reveal_id = p_ref and estado = 'aceptada';
    select * into v_invoice from public.invoices where id = v_room.invoice_id;
    select * into v_req from public.payment_requests
      where tipo = 'comision' and offer_id = v_offer.id and estado in ('pendiente', 'procesando')
      for update;
  else
    raise exception 'Tipo de pago no válido';
  end if;

  -- Una orden ya en curso en la pasarela: se devuelve tal cual.
  if found and v_req.estado = 'procesando' then
    return v_req;
  end if;
  if found and v_req.provider_ref is not null and v_req.expires_at > now() then
    return v_req;
  end if;
  if found and v_req.provider_ref is not null then
    update public.payment_requests set estado = 'vencido', updated_at = now() where id = v_req.id;
    v_req := null;
  end if;

  -- Monto en USD según la escala de siempre (sin cambios de tarifa).
  if p_tipo = 'desbloqueo' then
    v_usd := public.unlock_fee_for_monto(public.monto_en_usd(v_invoice.monto, v_invoice.moneda));
    if public.monto_en_usd(v_invoice.monto, v_invoice.moneda) is null then
      v_usd := null;
    end if;
  else
    v_usd := public.deal_fee_for_monto(public.monto_en_usd(v_offer.monto_ofrecido, v_invoice.moneda));
    if public.monto_en_usd(v_offer.monto_ofrecido, v_invoice.moneda) is null then
      v_usd := null;
    end if;
  end if;

  v_fx := public.tipo_cambio_vigente();
  if v_usd is null or v_fx.pyg_por_unidad is null then
    -- El servidor abre la excepción 'sin_tipo_cambio' al recibir este error.
    raise exception 'SIN_TIPO_CAMBIO: el pago no está disponible en este momento. Probá de nuevo en unos minutos';
  end if;

  v_pyg := ceil(v_usd * v_fx.pyg_por_unidad / 1000) * 1000;

  if v_req.id is not null then
    -- Comisión creada al aceptar, todavía sin orden en la pasarela.
    update public.payment_requests
      set monto = v_usd, moneda = 'USD', monto_usd = v_usd, moneda_cobro = 'PYG', monto_cobro = v_pyg,
          tipo_cambio = v_fx.pyg_por_unidad, tipo_cambio_fecha = v_fx.fecha,
          expires_at = now() + make_interval(hours => public.config_num('orden_pago_horas_vencimiento', 24)::int),
          updated_at = now()
      where id = v_req.id
      returning * into v_req;
  else
    insert into public.payment_requests
      (fondeador_id, invoice_id, reveal_id, offer_id, tipo, estado, monto, moneda, monto_usd,
       moneda_cobro, monto_cobro, tipo_cambio, tipo_cambio_fecha, expires_at)
    values
      (v_uid, v_invoice.id, v_room.id, v_offer.id, p_tipo, 'pendiente', v_usd, 'USD', v_usd,
       'PYG', v_pyg, v_fx.pyg_por_unidad, v_fx.fecha,
       now() + make_interval(hours => public.config_num('orden_pago_horas_vencimiento', 24)::int))
    returning * into v_req;
  end if;

  return v_req;
end;
$$;

grant execute on function public.preparar_pago(text, uuid) to authenticated;

-- El servidor (service role) guarda la referencia de la pasarela.
create or replace function public.registrar_orden_proveedor(
  p_request_id uuid,
  p_provider text,
  p_provider_ref text,
  p_checkout_url text
)
returns public.payment_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.payment_requests;
begin
  if not public.es_service_role() then
    raise exception 'Solo el servidor puede registrar órdenes de pago';
  end if;
  select * into v_req from public.payment_requests where id = p_request_id for update;
  if v_req.provider_ref is null then
    update public.payment_requests
      set provider = p_provider, provider_ref = p_provider_ref, checkout_url = p_checkout_url,
          payment_link = p_checkout_url, updated_at = now()
      where id = p_request_id
      returning * into v_req;
  end if;
  return v_req;
end;
$$;

revoke execute on function public.registrar_orden_proveedor(uuid, text, text, text) from public, anon, authenticated;
grant execute on function public.registrar_orden_proveedor(uuid, text, text, text) to service_role;

-- Guarda un aviso de la pasarela. Idempotente: el mismo aviso dos veces
-- devuelve la misma fila y `nuevo = false`.
create or replace function public.registrar_evento_pago(
  p_provider text,
  p_dedupe_key text,
  p_provider_ref text,
  p_estado text,
  p_monto numeric,
  p_moneda text,
  p_firma_valida boolean,
  p_payload jsonb,
  out evento_id uuid,
  out nuevo boolean,
  out resultado text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_service_role() then
    raise exception 'Solo el servidor puede registrar eventos de pago';
  end if;

  insert into public.payment_events
    (provider, dedupe_key, provider_ref, estado_informado, monto, moneda, firma_valida, payload)
  values
    (p_provider, p_dedupe_key, p_provider_ref, p_estado, p_monto, p_moneda, p_firma_valida,
     coalesce(p_payload, '{}'::jsonb))
  on conflict (provider, dedupe_key) do nothing
  returning id into evento_id;

  if evento_id is not null then
    nuevo := true;
    resultado := null;
  else
    nuevo := false;
    select id, e.resultado into evento_id, resultado from public.payment_events e
      where provider = p_provider and dedupe_key = p_dedupe_key;
  end if;

  if not p_firma_valida and nuevo then
    update public.payment_events set resultado = 'firma_invalida', procesado_at = now() where id = evento_id;
    perform public.abrir_excepcion('webhook_invalido',
      'Llegó un aviso de pago con firma inválida.', null, null, null, evento_id, null,
      jsonb_build_object('provider', p_provider, 'provider_ref', p_provider_ref));
    resultado := 'firma_invalida';
  end if;
end;
$$;

revoke execute on function public.registrar_evento_pago(text, text, text, text, numeric, text, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function public.registrar_evento_pago(text, text, text, text, numeric, text, boolean, jsonb)
  to service_role;

-- Aplica el resultado ya verificado (firma + consulta a la pasarela).
-- Idempotente y con validación de importe y moneda contra la orden.
create or replace function public.aplicar_resultado_pago(
  p_evento_id uuid,
  p_provider text,
  p_provider_ref text,
  p_estado text,
  p_monto numeric,
  p_moneda text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.payment_requests;
  v_res text;
  v_msg uuid;
begin
  if not public.es_service_role() then
    raise exception 'Solo el servidor puede aplicar pagos';
  end if;
  if p_estado not in ('procesando', 'confirmado', 'fallido', 'rechazado', 'vencido') then
    raise exception 'Estado de pago no válido: %', p_estado;
  end if;

  select * into v_req from public.payment_requests
    where provider = p_provider and provider_ref = p_provider_ref
    for update;

  if not found then
    perform public.abrir_excepcion('orden_desconocida',
      'La pasarela avisó un pago de una orden que ViaFactoring no tiene.', null, null, null, p_evento_id, null,
      jsonb_build_object('provider_ref', p_provider_ref, 'estado', p_estado, 'monto', p_monto, 'moneda', p_moneda));
    v_res := 'orden_desconocida';
  elsif p_estado = 'confirmado'
        and (p_monto is distinct from v_req.monto_cobro or p_moneda is distinct from v_req.moneda_cobro) then
    perform public.abrir_excepcion('pago_inconsistente',
      'El importe o la moneda informados no coinciden con la orden.', v_req.reveal_id, v_req.invoice_id,
      v_req.id, p_evento_id, v_req.fondeador_id,
      jsonb_build_object('esperado', v_req.monto_cobro, 'moneda_esperada', v_req.moneda_cobro,
                         'informado', p_monto, 'moneda_informada', p_moneda));
    v_res := 'importe_inconsistente';
  elsif v_req.estado = 'confirmado' then
    v_res := 'ya_aplicado';
  elsif v_req.estado = 'devuelto' then
    v_res := 'orden_devuelta';
  elsif p_estado = 'confirmado' then
    update public.payment_requests
      set estado = 'confirmado', paid_at = now(), confirmed_at = now(), updated_at = now()
      where id = v_req.id;
    if public.pago_sigue_necesario(v_req) then
      v_res := public.efectos_pago_confirmado(v_req.id);
    else
      -- Pago tardío o duplicado: se cobró pero ya no hace falta → devolver.
      perform public.abrir_excepcion('pago_duplicado',
        'Entró un pago que ya no era necesario. Corresponde devolverlo.', v_req.reveal_id, v_req.invoice_id,
        v_req.id, p_evento_id, v_req.fondeador_id);
      v_res := 'pago_no_necesario';
    end if;
  elsif v_req.estado in ('fallido', 'rechazado', 'vencido', 'cancelado') then
    v_res := 'sin_cambios';
  elsif p_estado = 'procesando' then
    update public.payment_requests set estado = 'procesando', updated_at = now()
      where id = v_req.id and estado = 'pendiente';
    v_res := 'procesando';
  else
    update public.payment_requests set estado = p_estado, updated_at = now() where id = v_req.id;
    if v_req.tipo = 'comision' and v_req.reveal_id is not null and p_estado in ('fallido', 'rechazado') then
      v_msg := public.evento_chat(v_req.reveal_id,
        'El pago de la comisión no pudo completarse. Podés intentarlo de nuevo.',
        jsonb_build_object('kind', 'pago_fallido', 'payment_request_id', v_req.id));
    end if;
    if p_estado in ('fallido', 'rechazado') then
      perform public.notificar(v_req.fondeador_id, v_req.reveal_id, v_msg, 'pago_fallido',
        'El pago no pudo completarse', 'Podés intentarlo de nuevo.', 'Intentar de nuevo');
    end if;
    v_res := p_estado;
  end if;

  if p_evento_id is not null then
    update public.payment_events
      set resultado = v_res, procesado_at = now(), payment_request_id = v_req.id
      where id = p_evento_id;
  end if;
  perform public.log_event('pago_' || v_res, v_req.invoice_id, v_req.reveal_id, 'payment_request', v_req.id,
    jsonb_build_object('provider', p_provider, 'provider_ref', p_provider_ref, 'estado', p_estado,
                       'evento_id', p_evento_id));
  return v_res;
end;
$$;

revoke execute on function public.aplicar_resultado_pago(uuid, text, text, text, numeric, text)
  from public, anon, authenticated;
grant execute on function public.aplicar_resultado_pago(uuid, text, text, text, numeric, text)
  to service_role;

-- Cotización del día (la carga el proceso programado desde el BCP).
create or replace function public.guardar_tipo_cambio(p_fecha date, p_pyg numeric, p_fuente text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_service_role() and not public.is_admin() then
    raise exception 'No autorizado';
  end if;
  if p_pyg is null or p_pyg < 2000 or p_pyg > 30000 then
    raise exception 'Tipo de cambio fuera de rango';
  end if;
  insert into public.fx_rates (fecha, moneda, pyg_por_unidad, fuente)
    values (p_fecha, 'USD', p_pyg, p_fuente)
  on conflict (fecha, moneda) do update set pyg_por_unidad = excluded.pyg_por_unidad, fuente = excluded.fuente;
  perform public.log_event('tipo_cambio', null, null, 'fx_rates', null,
    jsonb_build_object('fecha', p_fecha, 'pyg', p_pyg, 'fuente', p_fuente));
  -- Con cotización vigente, el aviso de "sin tipo de cambio" deja de aplicar.
  if (public.tipo_cambio_vigente()).fecha is not null then
    update public.exceptions
      set estado = 'resuelta', resolucion = 'Tipo de cambio cargado (' || p_fuente || ')', resuelta_at = now(),
          resuelta_por = case when public.es_service_role() then null else auth.uid() end
      where tipo = 'sin_tipo_cambio' and estado = 'abierta';
  end if;
end;
$$;

revoke execute on function public.guardar_tipo_cambio(date, numeric, text) from public, anon;
grant execute on function public.guardar_tipo_cambio(date, numeric, text) to authenticated, service_role;

-- =========================================================================
-- 7. La franja "Ahora te toca a vos" (calculada en la base)
-- =========================================================================

create or replace function public.turno_deal_room(p_reveal_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_room public.reveals;
  v_offer public.offers;
  v_pend public.offers;
  v_req public.payment_requests;
begin
  select * into v_room from public.reveals where id = p_reveal_id;

  if v_room.estado = 'cancelled' then
    return jsonb_build_object('accion', 'cerrada', 'actor', null);
  end if;
  if v_room.estado = 'closed' then
    return jsonb_build_object('accion', 'finalizada', 'actor', null);
  end if;

  if v_room.estado in ('open', 'negotiating') then
    select * into v_pend from public.offers where reveal_id = p_reveal_id and estado = 'pendiente';
    if found then
      return jsonb_build_object('accion', 'responder_oferta',
        'actor', case when v_pend.autor_rol = 'fondeador' then 'operador' else 'fondeador' end,
        'offer_id', v_pend.id, 'monto', v_pend.monto_ofrecido, 'autor_rol', v_pend.autor_rol,
        'expira_at', v_pend.expira_at);
    end if;
    return jsonb_build_object('accion', case when v_room.estado = 'open' then 'conversar' else 'negociar' end,
                              'actor', null);
  end if;

  select * into v_offer from public.offers where reveal_id = p_reveal_id and estado = 'aceptada';

  if v_room.estado = 'offer_accepted' then
    select * into v_req from public.payment_requests
      where tipo = 'comision' and offer_id = v_offer.id
      order by created_at desc limit 1;
    return jsonb_build_object(
      'accion', case when v_req.estado = 'procesando' then 'esperando_pago'
                     when v_req.estado in ('fallido', 'rechazado') then 'reintentar_comision'
                     else 'pagar_comision' end,
      'actor', 'fondeador', 'offer_id', v_offer.id, 'payment_request_id', v_req.id,
      'monto_usd', v_req.monto_usd, 'monto_cobro', v_req.monto_cobro, 'moneda_cobro', v_req.moneda_cobro,
      'vence_at', v_room.comision_vence_at);
  end if;

  -- closing: desembolso fuera de ViaFactoring
  return jsonb_build_object('accion', 'desembolso',
    'actor', case when v_offer.fondos_enviados_at is null and v_offer.fondos_recibidos_at is null then 'ambos'
                  when v_offer.fondos_enviados_at is null then 'fondeador'
                  when v_offer.fondos_recibidos_at is null then 'operador' end,
    'offer_id', v_offer.id,
    'enviado', v_offer.fondos_enviados_at is not null,
    'recibido', v_offer.fondos_recibidos_at is not null);
end;
$$;

revoke execute on function public.turno_deal_room(uuid) from public, anon, authenticated;

-- get_deal_room_detail: se suman turno, etapa visible y datos de las tarjetas.
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

-- Estado del pago del desbloqueo para la pantalla de la factura.
create or replace function public.estado_desbloqueo(p_invoice_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'reveal_id', (select id from public.reveals where invoice_id = p_invoice_id and fondeador_id = auth.uid()),
    'pago', (select jsonb_build_object('id', id, 'estado', estado, 'monto_cobro', monto_cobro,
                                       'moneda_cobro', moneda_cobro, 'monto_usd', monto_usd)
             from public.payment_requests
             where tipo = 'desbloqueo' and invoice_id = p_invoice_id and fondeador_id = auth.uid()
             order by created_at desc limit 1));
$$;

grant execute on function public.estado_desbloqueo(uuid) to authenticated;

-- =========================================================================
-- 8. Vencimientos y recordatorios (proceso programado cada 10 minutos)
-- =========================================================================

create or replace function public.vencer_y_recordar()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_msg uuid;
  v_p record;
  n_ofertas int := 0;
  n_ordenes int := 0;
  n_comisiones int := 0;
  n_recordatorios int := 0;
  v_otro record;
begin
  if not public.es_service_role() and not public.is_admin() then
    raise exception 'No autorizado';
  end if;

  -- 1. Ofertas sin respuesta
  for r in
    select o.*, i.moneda from public.offers o join public.invoices i on i.id = o.invoice_id
    where o.estado = 'pendiente' and o.expira_at < now()
    for update of o
  loop
    update public.offers set estado = 'expirada', respondida_at = now() where id = r.id;
    v_msg := public.evento_chat(r.reveal_id,
      '⏰ La oferta de ' || r.moneda || ' ' || public.formato_monto(r.monto_ofrecido)
        || ' venció sin respuesta. Pueden seguir negociando.',
      jsonb_build_object('kind', 'oferta_vencida', 'offer_id', r.id));
    select * into v_p from public.deal_room_partes(r.reveal_id);
    perform public.notificar(v_p.fondeador_id, r.reveal_id, v_msg, 'oferta_vencida', 'Una oferta venció', null);
    perform public.notificar(v_p.operador_id, r.reveal_id, v_msg, 'oferta_vencida', 'Una oferta venció', null);
    n_ofertas := n_ofertas + 1;
  end loop;

  -- 2. Órdenes de pago que nadie terminó de pagar (se genera otra al reintentar)
  update public.payment_requests set estado = 'vencido', updated_at = now()
    where estado = 'pendiente' and expires_at is not null and expires_at < now()
      and provider_ref is not null;
  get diagnostics n_ordenes = row_count;

  -- 3. Comisión impaga: se anula la aceptación y la negociación se reabre
  for r in
    select rv.*, o.id as offer_id from public.reveals rv
    join public.offers o on o.reveal_id = rv.id and o.estado = 'aceptada'
    where rv.estado = 'offer_accepted' and rv.contacto_liberado_at is null
      and rv.comision_vence_at < now()
      and not exists (select 1 from public.payment_requests p
                      where p.offer_id = o.id and p.estado in ('procesando', 'confirmado'))
    for update of rv
  loop
    update public.offers set estado = 'cancelada', respondida_at = now() where id = r.offer_id;
    update public.payment_requests set estado = 'cancelado', updated_at = now()
      where offer_id = r.offer_id and estado = 'pendiente';
    update public.reveals set estado = 'negotiating', comision_vence_at = null, ultima_actividad_at = now()
      where id = r.id;
    update public.invoices set estado = 'disponible' where id = r.invoice_id and estado = 'cerrada';

    v_msg := public.evento_chat(r.id,
      '⏰ La comisión no se pagó a tiempo y la aceptación quedó sin efecto. La negociación sigue abierta.',
      jsonb_build_object('kind', 'comision_vencida'));
    select * into v_p from public.deal_room_partes(r.id);
    perform public.notificar(v_p.fondeador_id, r.id, v_msg, 'comision_vencida',
      'La aceptación quedó sin efecto', 'La comisión no se pagó a tiempo.');
    perform public.notificar(v_p.operador_id, r.id, v_msg, 'comision_vencida',
      'La aceptación quedó sin efecto', 'Tu factura vuelve a estar disponible.');

    -- Los otros fondeadores que habían desbloqueado vuelven a su negociación.
    for v_otro in
      select id, fondeador_id from public.reveals
      where invoice_id = r.invoice_id and id <> r.id and estado = 'cancelled'
        and cancelado_motivo = 'cerrada_con_otro_fondeador'
    loop
      update public.reveals set estado = 'negotiating', cancelado_motivo = null, ultima_actividad_at = now()
        where id = v_otro.id;
      v_msg := public.evento_chat(v_otro.id,
        'La factura volvió a estar disponible. Podés retomar la negociación.',
        jsonb_build_object('kind', 'reabierta'));
      perform public.notificar(v_otro.fondeador_id, v_otro.id, v_msg, 'reabierta',
        'Una factura volvió a estar disponible', null);
    end loop;
    perform public.log_event('comision_vencida', r.invoice_id, r.id, 'reveal', r.id);
    n_comisiones := n_comisiones + 1;
  end loop;

  -- 4. Recordatorios (una sola vez cada uno gracias a `clave`)
  -- 4a. Oferta esperando respuesta: 24 h y 48 h
  for r in
    select o.id, o.reveal_id, o.autor_rol, o.monto_ofrecido, o.created_at, i.moneda
    from public.offers o join public.invoices i on i.id = o.invoice_id
    where o.estado = 'pendiente' and o.created_at < now() - interval '24 hours'
  loop
    select * into v_p from public.deal_room_partes(r.reveal_id);
    perform public.notificar(
      case when r.autor_rol = 'fondeador' then v_p.operador_id else v_p.fondeador_id end,
      r.reveal_id, null, 'recordatorio', '⏰ Tenés una acción pendiente',
      'Una oferta de ' || r.moneda || ' ' || public.formato_monto(r.monto_ofrecido) || ' espera tu respuesta.',
      'Ver oferta',
      'oferta:' || r.id || ':' || case when r.created_at < now() - interval '48 hours' then '48' else '24' end);
    n_recordatorios := n_recordatorios + 1;
  end loop;

  -- 4b. Comisión: 24 h y 72 h
  for r in
    select rv.id, rv.fondeador_id, o.respondida_at from public.reveals rv
    join public.offers o on o.reveal_id = rv.id and o.estado = 'aceptada'
    where rv.estado = 'offer_accepted' and o.respondida_at < now() - interval '24 hours'
  loop
    perform public.notificar(r.fondeador_id, r.id, null, 'recordatorio', '⏰ Tenés una acción pendiente',
      'Falta pagar la comisión para ver el contacto de la PyME.', 'Pagar comisión',
      'comision:' || r.id || ':' || case when r.respondida_at < now() - interval '72 hours' then '72' else '24' end);
    n_recordatorios := n_recordatorios + 1;
  end loop;

  -- 4c. Desembolso: 3 y 7 días (nunca cancela)
  for r in
    select rv.id, rv.contacto_liberado_at, o.fondos_enviados_at, o.fondos_recibidos_at
    from public.reveals rv join public.offers o on o.reveal_id = rv.id and o.estado = 'aceptada'
    where rv.estado = 'closing' and rv.contacto_liberado_at < now() - interval '3 days'
  loop
    select * into v_p from public.deal_room_partes(r.id);
    if r.fondos_enviados_at is null then
      perform public.notificar(v_p.fondeador_id, r.id, null, 'recordatorio', '⏰ Tenés una acción pendiente',
        '¿Ya enviaste los fondos? Indicalo en la conversación.', 'Ver conversación',
        'envio:' || r.id || ':' || case when r.contacto_liberado_at < now() - interval '7 days' then '7' else '3' end);
    end if;
    if r.fondos_recibidos_at is null then
      perform public.notificar(v_p.operador_id, r.id, null, 'recordatorio', '⏰ Tenés una acción pendiente',
        '¿Ya recibiste los fondos? Confirmalo en la conversación.', 'Ver conversación',
        'recepcion:' || r.id || ':' || case when r.contacto_liberado_at < now() - interval '7 days' then '7' else '3' end);
    end if;
    n_recordatorios := n_recordatorios + 1;
  end loop;

  return jsonb_build_object('ofertas_vencidas', n_ofertas, 'ordenes_vencidas', n_ordenes,
                            'comisiones_vencidas', n_comisiones, 'recordatorios', n_recordatorios);
end;
$$;

revoke execute on function public.vencer_y_recordar() from public, anon;
grant execute on function public.vencer_y_recordar() to authenticated, service_role;

-- =========================================================================
-- 9. Excepciones: reporte del usuario y acciones del admin
-- =========================================================================

create or replace function public.reportar_problema(p_reveal_id uuid, p_detalle text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text := public.deal_room_rol(p_reveal_id);
  v_room public.reveals;
begin
  if v_rol is null or v_rol = 'admin' then
    raise exception 'No sos parte de esta negociación';
  end if;
  if p_detalle is null or length(trim(p_detalle)) < 5 then
    raise exception 'Contanos brevemente qué pasó';
  end if;
  select * into v_room from public.reveals where id = p_reveal_id;
  return public.abrir_excepcion('reclamo', left(trim(p_detalle), 2000), p_reveal_id, v_room.invoice_id,
    null, null, auth.uid(), jsonb_build_object('rol', v_rol, 'estado_sala', v_room.estado));
end;
$$;

grant execute on function public.reportar_problema(uuid, text) to authenticated;

create or replace function public.admin_resolver_excepcion(p_id uuid, p_estado text, p_resolucion text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exc public.exceptions;
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede resolver excepciones';
  end if;
  if p_estado not in ('resuelta', 'descartada') or coalesce(length(trim(p_resolucion)), 0) < 5 then
    raise exception 'Indicá el resultado y un motivo';
  end if;
  update public.exceptions
    set estado = p_estado, resolucion = trim(p_resolucion), resuelta_por = auth.uid(), resuelta_at = now()
    where id = p_id and estado = 'abierta'
    returning * into v_exc;
  if not found then
    raise exception 'La excepción no existe o ya estaba cerrada';
  end if;
  perform public.log_event('admin_intervencion', v_exc.invoice_id, v_exc.reveal_id, 'exception', p_id,
    jsonb_build_object('accion', 'resolver', 'estado', p_estado, 'motivo', p_resolucion));
end;
$$;

grant execute on function public.admin_resolver_excepcion(uuid, text, text) to authenticated;

-- Aplica un pago verificado a mano (por ejemplo: la pasarela cobró y el
-- aviso nunca llegó, verificado en su portal). Solo desde una excepción.
create or replace function public.admin_aplicar_pago_verificado(p_exception_id uuid, p_motivo text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exc public.exceptions;
  v_req public.payment_requests;
  v_res text;
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede intervenir';
  end if;
  if coalesce(length(trim(p_motivo)), 0) < 10 then
    raise exception 'Escribí cómo verificaste el pago';
  end if;

  select * into v_exc from public.exceptions where id = p_exception_id and estado = 'abierta' for update;
  if not found or v_exc.payment_request_id is null then
    raise exception 'Esta excepción no tiene un pago asociado';
  end if;

  select * into v_req from public.payment_requests where id = v_exc.payment_request_id for update;
  if v_req.estado = 'devuelto' then
    raise exception 'Ese pago fue devuelto';
  end if;

  update public.payment_requests
    set estado = 'confirmado', paid_at = coalesce(paid_at, now()), confirmed_at = now(),
        confirmed_by = auth.uid(), updated_at = now()
    where id = v_req.id;
  if public.pago_sigue_necesario(v_req) then
    v_res := public.efectos_pago_confirmado(v_req.id);
  else
    v_res := 'pago_no_necesario';
  end if;

  update public.exceptions
    set estado = 'resuelta', resolucion = trim(p_motivo), resuelta_por = auth.uid(), resuelta_at = now()
    where id = p_exception_id;
  perform public.log_event('admin_intervencion', v_req.invoice_id, v_req.reveal_id, 'payment_request', v_req.id,
    jsonb_build_object('accion', 'aplicar_pago_verificado', 'motivo', p_motivo, 'resultado', v_res,
                       'excepcion', p_exception_id));
  return v_res;
end;
$$;

grant execute on function public.admin_aplicar_pago_verificado(uuid, text) to authenticated;

-- Marca un pago como devuelto (la devolución la hace el servidor en la
-- pasarela antes de llamar a esta función).
create or replace function public.admin_marcar_devuelto(p_exception_id uuid, p_motivo text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_exc public.exceptions;
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede intervenir';
  end if;
  if coalesce(length(trim(p_motivo)), 0) < 5 then
    raise exception 'Indicá el motivo de la devolución';
  end if;
  select * into v_exc from public.exceptions where id = p_exception_id and estado = 'abierta' for update;
  if not found or v_exc.payment_request_id is null then
    raise exception 'Esta excepción no tiene un pago asociado';
  end if;
  update public.payment_requests set estado = 'devuelto', updated_at = now()
    where id = v_exc.payment_request_id and estado = 'confirmado';
  if not found then
    raise exception 'Solo se puede devolver un pago confirmado';
  end if;
  update public.exceptions
    set estado = 'resuelta', resolucion = 'Devuelto: ' || trim(p_motivo), resuelta_por = auth.uid(), resuelta_at = now()
    where id = p_exception_id;
  perform public.log_event('admin_intervencion', v_exc.invoice_id, v_exc.reveal_id, 'payment_request',
    v_exc.payment_request_id, jsonb_build_object('accion', 'devolucion', 'motivo', p_motivo));
end;
$$;

grant execute on function public.admin_marcar_devuelto(uuid, text) to authenticated;

-- Emails pendientes (los manda el servidor) y su marca de envío.
create or replace function public.notificaciones_para_email(p_limite int default 50)
returns table (id uuid, email text, nombre text, titulo text, cuerpo text, accion_label text, url text)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_service_role() then
    raise exception 'No autorizado';
  end if;
  return query
    select n.id, p.email, p.nombre, n.titulo, n.cuerpo, n.accion_label, n.url
    from public.notifications n join public.profiles p on p.id = n.user_id
    where n.email_estado = 'pendiente' and n.leida_at is null
      -- los mensajes esperan 5 minutos por si la persona los lee en la web
      and (n.tipo <> 'mensaje' or n.updated_at < now() - interval '5 minutes')
    order by n.created_at
    limit p_limite;
end;
$$;

revoke execute on function public.notificaciones_para_email(int) from public, anon, authenticated;
grant execute on function public.notificaciones_para_email(int) to service_role;

create or replace function public.marcar_email_notificacion(p_id uuid, p_estado text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_service_role() then
    raise exception 'No autorizado';
  end if;
  update public.notifications
    set email_estado = p_estado, email_enviado_at = case when p_estado = 'enviado' then now() end
    where id = p_id;
end;
$$;

revoke execute on function public.marcar_email_notificacion(uuid, text) from public, anon, authenticated;
grant execute on function public.marcar_email_notificacion(uuid, text) to service_role;

-- Órdenes en curso hace más de 10 minutos sin aviso: el servidor consulta
-- su estado a la pasarela.
create or replace function public.ordenes_para_conciliar()
returns setof public.payment_requests
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.es_service_role() then
    raise exception 'No autorizado';
  end if;
  return query
    select * from public.payment_requests
    where estado in ('pendiente', 'procesando') and provider_ref is not null
      and updated_at < now() - interval '10 minutes'
      and created_at > now() - interval '3 days';
end;
$$;

revoke execute on function public.ordenes_para_conciliar() from public, anon, authenticated;
grant execute on function public.ordenes_para_conciliar() to service_role;

-- Vista de teasers: la tarifa de desbloqueo se muestra siempre en USD (para
-- facturas en guaraníes se ubica el tramo con la cotización del día).
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
  i.ubicacion
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
-- ROLLBACK (en orden inverso; los datos de las tablas nuevas se pierden)
-- =========================================================================
-- (re-crear invoice_teasers, get_deal_room_detail, registrar_oferta, respond_offer,
--  declarar_transferencia, deal_room_after_insert y marcar_leidos con sus
--  definiciones de 0007/0008/0010/0011)
-- drop function if exists public.ordenes_para_conciliar(), public.marcar_email_notificacion(uuid, text),
--   public.notificaciones_para_email(int), public.admin_marcar_devuelto(uuid, text),
--   public.admin_aplicar_pago_verificado(uuid, text), public.admin_resolver_excepcion(uuid, text, text),
--   public.reportar_problema(uuid, text), public.vencer_y_recordar(), public.estado_desbloqueo(uuid),
--   public.turno_deal_room(uuid), public.guardar_tipo_cambio(date, numeric, text),
--   public.aplicar_resultado_pago(uuid, text, text, text, numeric, text),
--   public.registrar_evento_pago(text, text, text, text, numeric, text, boolean, jsonb),
--   public.registrar_orden_proveedor(uuid, text, text, text), public.preparar_pago(text, uuid),
--   public.pago_sigue_necesario(public.payment_requests), public.efectos_pago_confirmado(uuid),
--   public.quien(text), public.messages_notificar(), public.evento_chat(uuid, text, jsonb),
--   public.deal_room_partes(uuid), public.notificar(uuid, uuid, uuid, text, text, text, text, text),
--   public.abrir_excepcion(text, text, uuid, uuid, uuid, uuid, uuid, jsonb), public.monto_en_usd(numeric, text),
--   public.tipo_cambio_vigente(), public.config_num(text, numeric);
-- drop trigger if exists messages_notificar_trg on public.messages;
-- drop table if exists public.notification_prefs, public.notifications, public.exceptions,
--   public.payment_events, public.fx_rates;
-- alter table public.reveals drop column comision_vence_at;
-- alter table public.offers drop column expira_at;  (+ check anterior sin 'expirada')
-- alter table public.payment_requests drop column provider, drop column provider_ref, ... (+ check anterior)
-- grant execute on function public.confirm_payment_request(uuid), public.solicitar_desbloqueo(uuid) to authenticated;

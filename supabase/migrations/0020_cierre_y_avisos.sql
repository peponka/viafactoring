-- 0020 · Cierre más fácil y avisos al instante
--   1. Ofertas sin "A definir": con recurso, aviso al deudor y fecha de pago
--      son obligatorios en toda oferta o contraoferta nueva.
--   2. Devolución de la comisión si la PyME no responde en 48 h después del
--      pago (la procesa el admin desde Excepciones).
--   3. Notificaciones push (Web Push): suscripciones por dispositivo y estado
--      de envío por notificación.

-- 1. Condiciones obligatorias ---------------------------------------------

create or replace function public.offers_condiciones_obligatorias()
returns trigger
language plpgsql
as $$
begin
  if new.con_recurso is null or new.notifica_deudor is null or new.fecha_pago_prevista is null then
    raise exception 'Completá si es con recurso, si se le avisa al deudor y cuándo se paga el anticipo';
  end if;
  return new;
end;
$$;

drop trigger if exists offers_condiciones_obligatorias_trg on public.offers;
create trigger offers_condiciones_obligatorias_trg
  before insert on public.offers
  for each row execute function public.offers_condiciones_obligatorias();

-- 2. Devolución si la PyME no responde ------------------------------------

insert into public.app_config (key, value) values ('devolucion_horas', '48')
on conflict (key) do nothing;

alter table public.exceptions drop constraint if exists exceptions_tipo_check;
alter table public.exceptions add constraint exceptions_tipo_check check (tipo in (
  'pago_inconsistente', 'webhook_invalido', 'orden_desconocida', 'pago_sin_aviso',
  'pago_duplicado', 'sin_tipo_cambio', 'reclamo', 'error_tecnico', 'posible_cierre_externo',
  'intento_contacto', 'devolucion_comision'));

alter table public.reveals add column if not exists devolucion_pedida_at timestamptz;

-- ¿Puede el fondeador pedir la devolución ahora? Devuelve null si puede, o
-- el motivo por el que todavía no.
create or replace function public.devolucion_bloqueo(p_reveal_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_room public.reveals;
  v_horas int := public.config_num('devolucion_horas', 48)::int;
begin
  select * into v_room from public.reveals where id = p_reveal_id;
  if not found or v_room.contacto_liberado_at is null then
    return 'La comisión todavía no está pagada';
  end if;
  if v_room.devolucion_pedida_at is not null then
    return 'Ya pediste la devolución';
  end if;
  if exists (
    select 1 from public.messages
    where reveal_id = p_reveal_id and autor_rol = 'operador' and created_at > v_room.contacto_liberado_at
  ) or exists (
    select 1 from public.offers
    where reveal_id = p_reveal_id and (fondos_enviados_at is not null or fondos_recibidos_at is not null)
  ) then
    return 'La PyME ya respondió';
  end if;
  if now() < v_room.contacto_liberado_at + make_interval(hours => v_horas) then
    return 'Todavía no pasaron ' || v_horas || ' horas desde el pago';
  end if;
  return null;
end;
$$;

grant execute on function public.devolucion_bloqueo(uuid) to authenticated;

create or replace function public.solicitar_devolucion(p_reveal_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.reveals;
  v_motivo text;
  v_pago public.payment_requests;
  v_msg uuid;
  v_op uuid;
begin
  select * into v_room from public.reveals where id = p_reveal_id for update;
  if not found or v_room.fondeador_id is distinct from auth.uid() then
    raise exception 'No sos parte de esta negociación';
  end if;
  v_motivo := public.devolucion_bloqueo(p_reveal_id);
  if v_motivo is not null then
    raise exception '%', v_motivo;
  end if;

  select p.* into v_pago from public.payment_requests p
    join public.offers o on o.id = p.offer_id
    where o.reveal_id = p_reveal_id and p.tipo = 'comision' and p.estado = 'confirmado'
    order by p.created_at desc limit 1;

  update public.reveals set devolucion_pedida_at = now() where id = p_reveal_id;

  perform public.abrir_excepcion(
    'devolucion_comision',
    'El fondeador pidió la devolución de la comisión: la PyME no respondió en '
      || public.config_num('devolucion_horas', 48)::int || ' horas después del pago.',
    p_reveal_id, v_room.invoice_id, v_pago.id, null, v_room.fondeador_id,
    jsonb_build_object('monto_usd', v_pago.monto_usd, 'monto_cobro', v_pago.monto_cobro,
                       'moneda_cobro', v_pago.moneda_cobro));

  v_msg := public.evento_chat(p_reveal_id,
    '↩️ El fondeador pidió la devolución de la comisión porque no hubo respuesta en '
      || public.config_num('devolucion_horas', 48)::int || ' horas. ViaFactoring la revisa y la procesa.',
    jsonb_build_object('kind', 'devolucion'));
  select operador_id into v_op from public.invoices where id = v_room.invoice_id;
  perform public.notificar(v_op, p_reveal_id, v_msg, 'devolucion',
    'El fondeador está esperando tu respuesta',
    'Pagó la comisión y no recibió respuesta. Si todavía te interesa, escribile hoy.',
    'Responder');
end;
$$;

revoke execute on function public.solicitar_devolucion(uuid) from public, anon;
grant execute on function public.solicitar_devolucion(uuid) to authenticated;

-- 3. Notificaciones push ----------------------------------------------------

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists push_subscriptions_user_idx on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

create policy "push_subscriptions_own_select" on public.push_subscriptions
  for select to authenticated using (user_id = auth.uid());
create policy "push_subscriptions_own_insert" on public.push_subscriptions
  for insert to authenticated with check (user_id = auth.uid());
create policy "push_subscriptions_own_delete" on public.push_subscriptions
  for delete to authenticated using (user_id = auth.uid());

-- Grants explícitos (Data API): el usuario maneja sus propios dispositivos;
-- el envío lo hace el servidor.
grant select, insert, delete on public.push_subscriptions to authenticated;
grant select, insert, update, delete on public.push_subscriptions to service_role;

alter table public.notifications
  add column if not exists push_estado text not null default 'pendiente'
    check (push_estado in ('pendiente', 'enviado', 'omitido', 'error'));

-- Las notificaciones viejas no se mandan por push.
update public.notifications set push_estado = 'omitido' where push_estado = 'pendiente';

-- Pendientes de push con las suscripciones de su usuario (solo servidor).
create or replace function public.notificaciones_para_push(p_limite int default 50)
returns table (
  id uuid,
  user_id uuid,
  titulo text,
  cuerpo text,
  url text,
  suscripciones jsonb
)
language sql
security definer
set search_path = public
as $$
  select n.id, n.user_id, n.titulo, n.cuerpo, n.url,
         coalesce((
           select jsonb_agg(jsonb_build_object('id', s.id, 'endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth))
           from public.push_subscriptions s where s.user_id = n.user_id
         ), '[]'::jsonb)
  from public.notifications n
  where n.push_estado = 'pendiente'
    and n.created_at > now() - interval '1 day'
  order by n.created_at
  limit p_limite;
$$;

revoke execute on function public.notificaciones_para_push(int) from public, anon, authenticated;
grant execute on function public.notificaciones_para_push(int) to service_role;

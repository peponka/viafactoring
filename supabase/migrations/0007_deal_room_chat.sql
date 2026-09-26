-- ViaFactoring — 0007: Deal Room + chat interno + detección de contacto
--
-- El Deal Room NO es una tabla nueva: es el `reveal` existente (un par
-- factura-fondeador) con estado, checklist y chat. `reveals` ya es la
-- pertenencia ("este fondeador tiene acceso a esta factura") y ya la usan
-- la RLS de offers, la vista de teasers y el acceso a documentos.
--
-- Requiere 0006 (audit_logs y permisos por columna en reveals).
-- Compatible con la app actual: no cambia nada que el frontend use hoy.

-- =========================================================================
-- 1. reveals → Deal Room
-- =========================================================================

alter table public.reveals
  add column estado text not null default 'open'
    check (estado in ('open', 'negotiating', 'offer_accepted', 'closing', 'closed', 'cancelled')),
  add column checklist jsonb not null default '[]'::jsonb,
  add column contacto_liberado_at timestamptz,
  add column cerrado_at timestamptz,
  add column cancelado_motivo text,
  add column ultima_actividad_at timestamptz not null default now();

create index reveals_estado_idx on public.reveals(estado);

-- Checklist por defecto (en V3 pasa a ser por industria). "auto" = lo marca
-- el sistema cuando ocurre el evento; el resto lo marcan las partes.
insert into public.app_config (key, value) values ('checklist_default', $json$[
  {"key": "documentacion_revisada", "label": "Documentación revisada por el fondeador", "auto": false},
  {"key": "oferta_aceptada", "label": "Oferta aceptada", "auto": true},
  {"key": "comision_pagada", "label": "Comisión de cierre pagada", "auto": true},
  {"key": "cesion_firmada", "label": "Cesión de la factura firmada", "auto": false},
  {"key": "deudor_notificado", "label": "Deudor notificado (si la oferta es con notificación)", "auto": false},
  {"key": "fondos_enviados", "label": "Fondos transferidos por el fondeador (fuera de ViaFactoring)", "auto": true},
  {"key": "fondos_recibidos", "label": "Fondos recibidos por la PyME", "auto": true}
]$json$)
on conflict (key) do nothing;

-- Parámetros de la señal de fuga (ajustables sin migración)
insert into public.app_config (key, value) values
  ('fuga_horas_contacto', '48'),
  ('fuga_dias_sin_oferta', '7')
on conflict (key) do nothing;

create or replace function public.checklist_inicial()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select jsonb_agg(e || jsonb_build_object('hecho', false))
       from jsonb_array_elements((select value::jsonb from public.app_config where key = 'checklist_default')) e),
    '[]'::jsonb);
$$;

-- Backfill de los reveals que ya existen:
--  * contacto_liberado_at = revealed_at: con el modelo anterior esos
--    fondeadores YA vieron el contacto; ocultárselo ahora no tiene sentido.
--  * estado según las ofertas y la factura.
update public.reveals set checklist = public.checklist_inicial() where checklist = '[]'::jsonb;
update public.reveals set contacto_liberado_at = revealed_at where contacto_liberado_at is null;

update public.reveals r set estado = 'offer_accepted'
  where exists (select 1 from public.offers o
                where o.invoice_id = r.invoice_id and o.fondeador_id = r.fondeador_id
                  and o.estado = 'aceptada');

update public.reveals r set estado = 'negotiating'
  where r.estado = 'open'
    and exists (select 1 from public.offers o
                where o.invoice_id = r.invoice_id and o.fondeador_id = r.fondeador_id
                  and o.estado = 'pendiente');

update public.reveals r set estado = 'cancelled', cancelado_motivo = 'factura_no_disponible'
  where r.estado in ('open', 'negotiating')
    and exists (select 1 from public.invoices i
                where i.id = r.invoice_id and i.estado <> 'disponible');

-- La PyME dueña de la factura también ve los Deal Rooms de sus facturas.
-- (Hoy la página del operador consulta `reveals` y siempre recibe 0 filas
-- por falta de esta policy.)
create policy "reveals_select_invoice_owner" on public.reveals
  for select using (
    exists (select 1 from public.invoices i
            where i.id = reveals.invoice_id and i.operador_id = auth.uid())
  );

-- =========================================================================
-- 2. Helpers de pertenencia
-- =========================================================================

-- Rol del usuario autenticado en un Deal Room: 'fondeador', 'operador',
-- 'admin' o null si no tiene nada que ver. Toda la seguridad del Deal Room
-- pasa por acá: nunca se compara un ID que manda el cliente.
create or replace function public.deal_room_rol(p_reveal_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case
    when r.fondeador_id = auth.uid() then 'fondeador'
    when i.operador_id = auth.uid() then 'operador'
    when public.is_admin() then 'admin'
  end
  from public.reveals r
  join public.invoices i on i.id = r.invoice_id
  where r.id = p_reveal_id;
$$;

create or replace function public.is_deal_room_member(p_reveal_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.deal_room_rol(p_reveal_id) is not null;
$$;

grant execute on function public.deal_room_rol(uuid) to authenticated;
grant execute on function public.is_deal_room_member(uuid) to authenticated;

-- =========================================================================
-- 3. Detección de datos de contacto (marca, no bloquea)
-- =========================================================================

create or replace function public.detectar_contacto(p_texto text)
returns text[]
language plpgsql
immutable
as $$
declare
  t text;
  d text;
  r text[] := '{}';
begin
  if p_texto is null or length(trim(p_texto)) = 0 then
    return r;
  end if;

  t := lower(p_texto);

  -- Números escritos en palabras ("cero nueve ocho uno...")
  t := regexp_replace(t, '\mcero\M', '0', 'g');
  t := regexp_replace(t, '\muno\M', '1', 'g');
  t := regexp_replace(t, '\mdos\M', '2', 'g');
  t := regexp_replace(t, '\mtres\M', '3', 'g');
  t := regexp_replace(t, '\mcuatro\M', '4', 'g');
  t := regexp_replace(t, '\mcinco\M', '5', 'g');
  t := regexp_replace(t, '\mseis\M', '6', 'g');
  t := regexp_replace(t, '\msiete\M', '7', 'g');
  t := regexp_replace(t, '\mocho\M', '8', 'g');
  t := regexp_replace(t, '\mnueve\M', '9', 'g');

  -- Colapsa separadores ENTRE dígitos: "0981 111-111" → "0981111111"
  d := regexp_replace(t, '(\d)[\s.()/-]+(?=\d)', '\1', 'g');

  -- Teléfonos paraguayos: celulares 09[5-9]x (con o sin +595) y línea de
  -- Asunción 021. Números largos que no empiezan así (montos en Gs,
  -- RUC, número de factura 001-001-...) no se marcan.
  if d ~ '(\+?5959[5-9]\d{7}\M|\m09[5-9]\d{7}\M|\m021\d{6,7}\M|\+\d{9,15})' then
    r := array_append(r, 'telefono');
  end if;

  if t ~ '(\m(whatsapp|whatsap|watsap|wasap|guasap|wsp|wpp)\M|wa\.me)' then
    r := array_append(r, 'whatsapp');
  end if;

  if t ~ '(\m(telegram|telegran)\M|t\.me/)' then
    r := array_append(r, 'telegram');
  end if;

  if t ~ '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
     or t ~ '\marroba\M'
     or t ~ '\m(gmail|hotmail|outlook|yahoo)\M' then
    r := array_append(r, 'email');
  end if;

  if t ~ '(https?://|www\.|\m[a-z0-9-]+\.(com|net|org|io|app|py)\M)' then
    r := array_append(r, 'url');
  end if;

  if t ~ '(^|\s)@[a-z0-9_.]{3,}' then
    r := array_append(r, 'usuario');
  end if;

  return r;
end;
$$;

grant execute on function public.detectar_contacto(text) to authenticated;

-- =========================================================================
-- 4. Mensajes
-- =========================================================================

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  reveal_id uuid not null references public.reveals(id) on delete cascade,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  autor_id uuid references public.profiles(id) on delete set null,
  autor_rol text not null check (autor_rol in ('fondeador', 'operador', 'sistema')),
  tipo text not null default 'mensaje'
    check (tipo in ('mensaje', 'pregunta', 'solicitud', 'respuesta', 'sistema')),
  cuerpo text not null check (length(cuerpo) between 1 and 4000),
  reply_to uuid references public.messages(id) on delete set null,
  document_id uuid, -- FK a documents en 0009
  solicitud_estado text check (solicitud_estado in ('abierta', 'resuelta')),
  contacto_detectado boolean not null default false,
  patrones text[] not null default '{}',
  meta jsonb not null default '{}'::jsonb,
  leido_at timestamptz,
  created_at timestamptz not null default now()
);

create index messages_reveal_created_idx on public.messages(reveal_id, created_at);
create index messages_contacto_idx on public.messages(contacto_detectado) where contacto_detectado;

alter table public.messages enable row level security;

create policy "messages_select_members" on public.messages
  for select using (public.is_deal_room_member(reveal_id));

-- Sin insert/update/delete desde el cliente: todo pasa por funciones.
revoke insert, update, delete, truncate on public.messages from anon, authenticated;

-- Realtime (en Supabase la publicación ya existe)
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- Mensaje del sistema (eventos del Deal Room). Interno: no se expone.
create or replace function public.post_system_message(
  p_reveal_id uuid,
  p_cuerpo text,
  p_meta jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.messages (reveal_id, invoice_id, autor_id, autor_rol, tipo, cuerpo, meta)
  select r.id, r.invoice_id, null, 'sistema', 'sistema', p_cuerpo, coalesce(p_meta, '{}'::jsonb)
  from public.reveals r where r.id = p_reveal_id;

  update public.reveals set ultima_actividad_at = now() where id = p_reveal_id;
end;
$$;

-- Marca un ítem del checklist. Interno: lo usan las funciones del sistema
-- y actualizar_checklist (que valida qué puede tocar cada parte).
create or replace function public.checklist_marcar(
  p_reveal_id uuid,
  p_key text,
  p_hecho boolean,
  p_actor uuid default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.reveals r
    set checklist = (
      select coalesce(jsonb_agg(
               case when e->>'key' = p_key
                    then e || jsonb_build_object('hecho', p_hecho,
                                                 'hecho_at', case when p_hecho then now() end,
                                                 'hecho_por', case when p_hecho then p_actor end)
                    else e end
               order by ord), '[]'::jsonb)
      from jsonb_array_elements(r.checklist) with ordinality as x(e, ord)
    ),
    ultima_actividad_at = now()
  where r.id = p_reveal_id;
end;
$$;

-- Al abrirse un Deal Room (insert en reveals, que hoy ocurre al confirmar
-- el pago del desbloqueo): checklist inicial + mensaje de bienvenida.
create or replace function public.deal_room_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.checklist = '[]'::jsonb then
    new.checklist := public.checklist_inicial();
  end if;
  return new;
end;
$$;

create trigger deal_room_before_insert
  before insert on public.reveals
  for each row execute function public.deal_room_on_insert();

create or replace function public.deal_room_after_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.post_system_message(new.id,
    'Deal Room abierto. Acá pueden hacer preguntas, compartir documentos y negociar la oferta. ' ||
    'El contacto directo se habilita al cerrar el acuerdo.');
  return new;
end;
$$;

create trigger deal_room_after_insert
  after insert on public.reveals
  for each row execute function public.deal_room_after_insert();

-- -------------------------------------------------------------------------
-- Funciones que usa el cliente
-- -------------------------------------------------------------------------

create or replace function public.send_message(
  p_reveal_id uuid,
  p_cuerpo text,
  p_tipo text default 'mensaje',
  p_reply_to uuid default null
)
returns public.messages
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text := public.deal_room_rol(p_reveal_id);
  v_room public.reveals;
  v_pat text[];
  v_msg public.messages;
begin
  if v_rol is null or v_rol = 'admin' then
    raise exception 'No sos parte de este Deal Room';
  end if;

  select * into v_room from public.reveals where id = p_reveal_id;
  if v_room.estado = 'cancelled' then
    raise exception 'Este Deal Room está cancelado';
  end if;

  if p_tipo not in ('mensaje', 'pregunta', 'solicitud', 'respuesta') then
    raise exception 'Tipo de mensaje no válido';
  end if;

  if p_cuerpo is null or length(trim(p_cuerpo)) = 0 or length(p_cuerpo) > 4000 then
    raise exception 'El mensaje tiene que tener entre 1 y 4000 caracteres';
  end if;

  if p_reply_to is not null and not exists (
    select 1 from public.messages where id = p_reply_to and reveal_id = p_reveal_id
  ) then
    raise exception 'El mensaje al que respondés no es de este Deal Room';
  end if;

  v_pat := public.detectar_contacto(p_cuerpo);

  insert into public.messages
    (reveal_id, invoice_id, autor_id, autor_rol, tipo, cuerpo, reply_to,
     solicitud_estado, contacto_detectado, patrones)
  values
    (p_reveal_id, v_room.invoice_id, auth.uid(), v_rol, p_tipo, trim(p_cuerpo), p_reply_to,
     case when p_tipo = 'solicitud' then 'abierta' end,
     cardinality(v_pat) > 0, v_pat)
  returning * into v_msg;

  update public.reveals set ultima_actividad_at = now() where id = p_reveal_id;

  perform public.log_event('mensaje', v_room.invoice_id, p_reveal_id, 'message', v_msg.id,
    jsonb_build_object('tipo', p_tipo, 'contacto_detectado', cardinality(v_pat) > 0));

  if cardinality(v_pat) > 0 then
    perform public.log_event('contacto_detectado', v_room.invoice_id, p_reveal_id, 'message', v_msg.id,
      jsonb_build_object('patrones', v_pat, 'autor_rol', v_rol, 'estado_deal_room', v_room.estado,
                         'horas_desde_desbloqueo',
                         round((extract(epoch from now() - v_room.revealed_at) / 3600)::numeric, 1)));
  end if;

  return v_msg;
end;
$$;

grant execute on function public.send_message(uuid, text, text, uuid) to authenticated;

create or replace function public.resolver_solicitud(p_message_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_msg public.messages;
  v_rol text;
begin
  select * into v_msg from public.messages where id = p_message_id;
  if not found or v_msg.tipo <> 'solicitud' then
    raise exception 'Solicitud no encontrada';
  end if;

  v_rol := public.deal_room_rol(v_msg.reveal_id);
  if v_rol is null or v_rol = 'admin' then
    raise exception 'No sos parte de este Deal Room';
  end if;

  update public.messages set solicitud_estado = 'resuelta' where id = p_message_id;
  perform public.log_event('solicitud_resuelta', v_msg.invoice_id, v_msg.reveal_id, 'message', p_message_id);
end;
$$;

grant execute on function public.resolver_solicitud(uuid) to authenticated;

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
    where reveal_id = p_reveal_id
      and leido_at is null
      and autor_rol <> v_rol;
end;
$$;

grant execute on function public.marcar_leidos(uuid) to authenticated;

-- Las partes solo pueden marcar los ítems manuales del checklist.
create or replace function public.actualizar_checklist(
  p_reveal_id uuid,
  p_key text,
  p_hecho boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text := public.deal_room_rol(p_reveal_id);
  v_item jsonb;
  v_room public.reveals;
begin
  if v_rol is null or v_rol = 'admin' then
    raise exception 'No sos parte de este Deal Room';
  end if;

  select * into v_room from public.reveals where id = p_reveal_id;
  if v_room.estado = 'cancelled' then
    raise exception 'Este Deal Room está cancelado';
  end if;

  select e into v_item from jsonb_array_elements(v_room.checklist) e where e->>'key' = p_key;
  if v_item is null then
    raise exception 'Ítem de checklist inexistente';
  end if;
  if (v_item->>'auto')::boolean then
    raise exception 'Ese paso lo marca el sistema automáticamente';
  end if;

  perform public.checklist_marcar(p_reveal_id, p_key, p_hecho, auth.uid());
  perform public.log_event('checklist', v_room.invoice_id, p_reveal_id, 'reveal', p_reveal_id,
    jsonb_build_object('key', p_key, 'hecho', p_hecho));
end;
$$;

grant execute on function public.actualizar_checklist(uuid, text, boolean) to authenticated;

-- Funciones internas: fuera del alcance del cliente
revoke execute on function public.post_system_message(uuid, text, jsonb) from public, anon, authenticated;
revoke execute on function public.checklist_marcar(uuid, text, boolean, uuid) from public, anon, authenticated;
revoke execute on function public.checklist_inicial() from public, anon, authenticated;
revoke execute on function public.deal_room_on_insert() from public, anon, authenticated;
revoke execute on function public.deal_room_after_insert() from public, anon, authenticated;

-- =========================================================================
-- 5. Señales de fuga (solo admin, vía RLS de las tablas de abajo)
--    "Compartió contacto poco después del desbloqueo y no hubo oferta"
-- =========================================================================

create view public.senales_fuga
with (security_invoker = true)
as
select
  r.id as reveal_id,
  r.invoice_id,
  r.fondeador_id,
  r.revealed_at,
  r.estado,
  m.id as message_id,
  m.autor_rol,
  m.patrones,
  m.created_at as contacto_at
from public.reveals r
join public.messages m on m.reveal_id = r.id and m.contacto_detectado
where public.is_admin()
  and m.created_at <= r.revealed_at
        + make_interval(hours => (select value::int from public.app_config where key = 'fuga_horas_contacto'))
  and now() >= r.revealed_at
        + make_interval(days => (select value::int from public.app_config where key = 'fuga_dias_sin_oferta'))
  and not exists (
    select 1 from public.offers o
    where o.invoice_id = r.invoice_id and o.fondeador_id = r.fondeador_id
  );

revoke all on public.senales_fuga from anon;

-- =========================================================================
-- ROLLBACK
-- =========================================================================
-- drop view if exists public.senales_fuga;
-- drop function if exists public.actualizar_checklist(uuid, text, boolean),
--   public.marcar_leidos(uuid), public.resolver_solicitud(uuid),
--   public.send_message(uuid, text, text, uuid);
-- drop trigger if exists deal_room_after_insert on public.reveals;
-- drop trigger if exists deal_room_before_insert on public.reveals;
-- drop function if exists public.deal_room_after_insert(), public.deal_room_on_insert(),
--   public.checklist_marcar(uuid, text, boolean, uuid), public.post_system_message(uuid, text, jsonb);
-- drop table if exists public.messages;
-- drop function if exists public.detectar_contacto(text), public.is_deal_room_member(uuid),
--   public.deal_room_rol(uuid), public.checklist_inicial();
-- drop policy if exists "reveals_select_invoice_owner" on public.reveals;
-- alter table public.reveals drop column estado, drop column checklist,
--   drop column contacto_liberado_at, drop column cerrado_at,
--   drop column cancelado_motivo, drop column ultima_actividad_at;
-- delete from public.app_config where key in ('checklist_default', 'fuga_horas_contacto', 'fuga_dias_sin_oferta');

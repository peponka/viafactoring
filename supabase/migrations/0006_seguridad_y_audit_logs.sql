-- ViaFactoring — 0006: correcciones de seguridad urgentes + audit log
--
-- PARTE 1 (URGENTE, se puede aplicar sola y no rompe nada de la app actual)
-- Cierra dos agujeros de escalada de privilegios que existen hoy:
--
--   a) profiles: la policy "profiles_update_own_or_admin" deja que cualquier
--      usuario actualice CUALQUIER columna de su propio perfil, incluida
--      `role`. Con la API REST de Supabase (la anon key es pública) un
--      fondeador puede hacerse admin a sí mismo y confirmar sus propios pagos.
--
--   b) reveals: la policy "reveals_update_own_or_admin" deja que el
--      fondeador cambie `invoice_id` de su reveal. Moviendo un reveal pagado
--      a otra factura, `reveal_invoice` le devuelve deudor y contactos de
--      una operación que nunca pagó.
--
-- La corrección no toca las policies: restringe QUÉ COLUMNAS puede
-- actualizar el cliente. Las funciones SECURITY DEFINER no se ven afectadas
-- porque corren con los permisos del dueño.
--
-- La app hoy solo actualiza reveals.contactado (marcarContactadoAction) y
-- no actualiza profiles desde el cliente, así que nada deja de funcionar.
--
-- PARTE 2: tabla audit_logs, inmutable, que solo se escribe desde la base
-- (triggers) o desde el servidor (service role). El cliente no puede
-- escribir ni leer; solo el admin lee.

-- =========================================================================
-- PARTE 1 — permisos por columna
-- =========================================================================

revoke update on public.profiles from anon, authenticated;
grant update (nombre, empresa, telefono) on public.profiles to authenticated;

revoke update on public.reveals from anon, authenticated;
grant update (contactado, bitacora) on public.reveals to authenticated;

-- =========================================================================
-- PARTE 2 — audit_logs
-- =========================================================================

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  actor_id uuid references public.profiles(id) on delete set null,
  actor_rol text,
  accion text not null,
  invoice_id uuid references public.invoices(id) on delete set null,
  reveal_id uuid references public.reveals(id) on delete set null,
  entidad text,
  entidad_id uuid,
  meta jsonb not null default '{}'::jsonb
);

create index audit_logs_invoice_id_idx on public.audit_logs(invoice_id);
create index audit_logs_reveal_id_idx on public.audit_logs(reveal_id);
create index audit_logs_actor_id_idx on public.audit_logs(actor_id);
create index audit_logs_accion_created_idx on public.audit_logs(accion, created_at desc);

alter table public.audit_logs enable row level security;

create policy "audit_logs_select_admin" on public.audit_logs
  for select using (public.is_admin());

-- Nadie escribe desde el cliente (ni siquiera el admin).
revoke insert, update, delete, truncate on public.audit_logs from anon, authenticated;

-- Inmutable: ni la service role puede editar o borrar un evento.
create or replace function public.audit_logs_inmutable()
returns trigger
language plpgsql
as $$
begin
  raise exception 'audit_logs es de solo agregado: no se puede modificar ni borrar';
end;
$$;

create trigger audit_logs_no_update
  before update or delete on public.audit_logs
  for each row execute function public.audit_logs_inmutable();

-- Punto único de escritura. Se llama desde triggers de la base y desde el
-- servidor con la service role (por ejemplo, para registrar "vista" o
-- "documento_descargado"). NO se expone al cliente: si pudiera llamarla,
-- podría inventar eventos.
create or replace function public.log_event(
  p_accion text,
  p_invoice_id uuid default null,
  p_reveal_id uuid default null,
  p_entidad text default null,
  p_entidad_id uuid default null,
  p_meta jsonb default '{}'::jsonb,
  p_actor_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := coalesce(p_actor_id, auth.uid());
  v_id uuid;
begin
  insert into public.audit_logs
    (actor_id, actor_rol, accion, invoice_id, reveal_id, entidad, entidad_id, meta)
  values (
    v_actor,
    (select role from public.profiles where id = v_actor),
    p_accion, p_invoice_id, p_reveal_id, p_entidad, p_entidad_id,
    coalesce(p_meta, '{}'::jsonb)
  )
  returning id into v_id;
  return v_id;
end;
$$;

revoke execute on function public.log_event(text, uuid, uuid, text, uuid, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.log_event(text, uuid, uuid, text, uuid, jsonb, uuid)
  to service_role;

-- -------------------------------------------------------------------------
-- Triggers de auditoría sobre las tablas que ya existen
-- -------------------------------------------------------------------------

create or replace function public.audit_invoices()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_event('factura_publicada', new.id, null, 'invoice', new.id,
      jsonb_build_object('monto', new.monto, 'moneda', new.moneda, 'rubro', new.rubro));
  elsif new.estado is distinct from old.estado then
    perform public.log_event('factura_estado', new.id, null, 'invoice', new.id,
      jsonb_build_object('de', old.estado, 'a', new.estado));
  end if;
  return new;
end;
$$;

create trigger audit_invoices_trg
  after insert or update on public.invoices
  for each row execute function public.audit_invoices();

create or replace function public.audit_reveals()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.log_event('desbloqueo', new.invoice_id, new.id, 'reveal', new.id,
    jsonb_build_object('fondeador_id', new.fondeador_id));
  return new;
end;
$$;

create trigger audit_reveals_trg
  after insert on public.reveals
  for each row execute function public.audit_reveals();

create or replace function public.audit_payment_requests()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_event('pago_solicitado', new.invoice_id, null, 'payment_request', new.id,
      jsonb_build_object('tipo', new.tipo, 'monto', new.monto, 'moneda', new.moneda,
                         'fondeador_id', new.fondeador_id, 'offer_id', new.offer_id));
  elsif new.estado is distinct from old.estado then
    perform public.log_event('pago_' || new.estado, new.invoice_id, null, 'payment_request', new.id,
      jsonb_build_object('tipo', new.tipo, 'monto', new.monto, 'de', old.estado));
  end if;
  return new;
end;
$$;

create trigger audit_payment_requests_trg
  after insert or update on public.payment_requests
  for each row execute function public.audit_payment_requests();

create or replace function public.audit_offers()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    perform public.log_event('oferta', new.invoice_id, null, 'offer', new.id,
      jsonb_build_object('monto_ofrecido', new.monto_ofrecido, 'fondeador_id', new.fondeador_id));
  elsif new.estado is distinct from old.estado then
    perform public.log_event('oferta_' || new.estado, new.invoice_id, null, 'offer', new.id,
      jsonb_build_object('monto_ofrecido', new.monto_ofrecido, 'de', old.estado));
  elsif new.monto_ofrecido is distinct from old.monto_ofrecido then
    perform public.log_event('oferta_modificada', new.invoice_id, null, 'offer', new.id,
      jsonb_build_object('de', old.monto_ofrecido, 'a', new.monto_ofrecido));
  end if;
  return new;
end;
$$;

create trigger audit_offers_trg
  after insert or update on public.offers
  for each row execute function public.audit_offers();

-- Las funciones de trigger no se llaman directo desde el cliente.
revoke execute on function public.audit_invoices() from public, anon, authenticated;
revoke execute on function public.audit_reveals() from public, anon, authenticated;
revoke execute on function public.audit_payment_requests() from public, anon, authenticated;
revoke execute on function public.audit_offers() from public, anon, authenticated;

-- =========================================================================
-- ROLLBACK (solo si hiciera falta volver atrás; NO deshacer la Parte 1)
-- =========================================================================
-- drop trigger if exists audit_offers_trg on public.offers;
-- drop trigger if exists audit_payment_requests_trg on public.payment_requests;
-- drop trigger if exists audit_reveals_trg on public.reveals;
-- drop trigger if exists audit_invoices_trg on public.invoices;
-- drop function if exists public.audit_offers(), public.audit_payment_requests(),
--   public.audit_reveals(), public.audit_invoices();
-- drop function if exists public.log_event(text, uuid, uuid, text, uuid, jsonb, uuid);
-- drop table if exists public.audit_logs;
-- drop function if exists public.audit_logs_inmutable();

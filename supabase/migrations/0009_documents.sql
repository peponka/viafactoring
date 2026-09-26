-- ViaFactoring — 0009: documentos con acceso por nivel y trazabilidad
--
-- Los fondeadores nunca reciben una URL de Storage. El documento se pide a
-- una ruta del servidor (/api/documentos/[id]) que:
--   1. llama a can_access_document(id) con la sesión del usuario,
--   2. registra la descarga con log_event (su id = identificador único),
--   3. baja el original con la service role, le pone watermark y lo entrega.
--
-- Requiere 0006, 0007 y 0008. Compatible con la app actual.

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  -- null = documento de la factura (visible desde el Nivel 2 para quien
  -- la desbloqueó); con valor = compartido solo en ese Deal Room.
  reveal_id uuid references public.reveals(id) on delete cascade,
  subido_por uuid references public.profiles(id) on delete set null,
  storage_path text not null unique,
  nombre text not null,
  mime text,
  tipo text not null default 'otro'
    check (tipo in ('factura', 'factura_tapada', 'remito', 'contrato', 'certificado', 'otro')),
  nivel_minimo smallint not null default 2 check (nivel_minimo between 2 and 4),
  created_at timestamptz not null default now()
);

create index documents_invoice_id_idx on public.documents(invoice_id);
create index documents_reveal_id_idx on public.documents(reveal_id);

alter table public.messages
  add constraint messages_document_id_fkey
  foreign key (document_id) references public.documents(id) on delete set null;

-- =========================================================================
-- Nivel de información alcanzado en un Deal Room
--   2 = desbloqueado · 3 = hubo al menos una oferta · 4 = contacto liberado
-- =========================================================================

create or replace function public.nivel_deal_room(p_reveal_id uuid)
returns smallint
language sql
stable
security definer
set search_path = public
as $$
  select case
    when r.contacto_liberado_at is not null then 4
    when exists (select 1 from public.offers o where o.reveal_id = r.id) then 3
    else 2
  end::smallint
  from public.reveals r where r.id = p_reveal_id;
$$;

grant execute on function public.nivel_deal_room(uuid) to authenticated;

create or replace function public.can_access_document(p_document_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_doc public.documents;
  v_room public.reveals;
begin
  select * into v_doc from public.documents where id = p_document_id;
  if not found then
    return false;
  end if;

  if public.is_admin() then
    return true;
  end if;

  if exists (select 1 from public.invoices where id = v_doc.invoice_id and operador_id = auth.uid())
     or v_doc.subido_por = auth.uid() then
    return true;
  end if;

  select * into v_room from public.reveals
    where invoice_id = v_doc.invoice_id and fondeador_id = auth.uid();
  if not found then
    return false;
  end if;

  if v_doc.reveal_id is not null and v_doc.reveal_id <> v_room.id then
    return false;
  end if;

  return public.nivel_deal_room(v_room.id) >= v_doc.nivel_minimo;
end;
$$;

grant execute on function public.can_access_document(uuid) to authenticated;

alter table public.documents enable row level security;

create policy "documents_select_si_puede_acceder" on public.documents
  for select using (public.can_access_document(id));

-- El cliente ve los metadatos, nunca la ruta en Storage.
revoke all on public.documents from anon, authenticated;
grant select (id, invoice_id, reveal_id, subido_por, nombre, mime, tipo, nivel_minimo, created_at)
  on public.documents to authenticated;

-- =========================================================================
-- Sincronización con invoices.documento_url (lo que usa la app hoy)
-- =========================================================================

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
            regexp_replace(new.documento_url, '^.*/', ''), 'factura', 2)
    on conflict (storage_path) do nothing;
  end if;
  return new;
end;
$$;

create trigger sync_documento_factura_trg
  after insert or update of documento_url on public.invoices
  for each row execute function public.sync_documento_factura();

revoke execute on function public.sync_documento_factura() from public, anon, authenticated;

insert into public.documents (invoice_id, subido_por, storage_path, nombre, tipo, nivel_minimo)
select id, operador_id, documento_url, regexp_replace(documento_url, '^.*/', ''), 'factura', 2
from public.invoices
where documento_url is not null
on conflict (storage_path) do nothing;

-- =========================================================================
-- Registro de documentos nuevos
-- El archivo lo sube el servidor (service role) a la ruta indicada; acá se
-- registra con la sesión del usuario, así la pertenencia la valida la base.
-- =========================================================================

-- Documento compartido dentro de un Deal Room.
-- Ruta obligatoria: deal-rooms/{reveal_id}/...
create or replace function public.registrar_documento_deal_room(
  p_reveal_id uuid,
  p_storage_path text,
  p_nombre text,
  p_mime text,
  p_tipo text default 'otro',
  p_nivel_minimo smallint default 2
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rol text := public.deal_room_rol(p_reveal_id);
  v_room public.reveals;
  v_id uuid;
begin
  if v_rol is null or v_rol = 'admin' then
    raise exception 'No sos parte de este Deal Room';
  end if;

  select * into v_room from public.reveals where id = p_reveal_id;
  if v_room.estado = 'cancelled' then
    raise exception 'Este Deal Room está cancelado';
  end if;

  if p_storage_path not like 'deal-rooms/' || p_reveal_id::text || '/%' then
    raise exception 'Ruta de archivo no válida para este Deal Room';
  end if;
  if coalesce(p_mime, '') not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'Solo se aceptan PDF, JPG o PNG';
  end if;
  if p_nivel_minimo not between 2 and 4 then
    raise exception 'Nivel no válido';
  end if;

  insert into public.documents
    (invoice_id, reveal_id, subido_por, storage_path, nombre, mime, tipo, nivel_minimo)
  values
    (v_room.invoice_id, p_reveal_id, auth.uid(), p_storage_path, left(p_nombre, 200), p_mime,
     coalesce(p_tipo, 'otro'), p_nivel_minimo)
  returning id into v_id;

  insert into public.messages (reveal_id, invoice_id, autor_id, autor_rol, tipo, cuerpo, document_id)
  values (p_reveal_id, v_room.invoice_id, auth.uid(), v_rol, 'mensaje',
          'Compartió un documento: ' || left(p_nombre, 200), v_id);
  update public.reveals set ultima_actividad_at = now() where id = p_reveal_id;

  perform public.log_event('documento_subido', v_room.invoice_id, p_reveal_id, 'document', v_id,
    jsonb_build_object('tipo', p_tipo, 'nivel_minimo', p_nivel_minimo));
  return v_id;
end;
$$;

grant execute on function public.registrar_documento_deal_room(uuid, text, text, text, text, smallint) to authenticated;

-- Documento de la factura (lo sube la PyME dueña).
-- Ruta obligatoria: {operador_id}/{invoice_id}/... (la convención actual).
-- Si sube una versión con datos tapados, esa queda en el Nivel 2 y el
-- original pasa al Nivel 4.
create or replace function public.registrar_documento_factura(
  p_invoice_id uuid,
  p_storage_path text,
  p_nombre text,
  p_mime text,
  p_tipo text default 'factura'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.invoices where id = p_invoice_id and operador_id = auth.uid()) then
    raise exception 'Solo la PyME dueña de la factura puede subir documentos a la factura';
  end if;
  if p_storage_path not like auth.uid()::text || '/' || p_invoice_id::text || '/%' then
    raise exception 'Ruta de archivo no válida para esta factura';
  end if;
  if coalesce(p_mime, '') not in ('application/pdf', 'image/jpeg', 'image/png') then
    raise exception 'Solo se aceptan PDF, JPG o PNG';
  end if;
  if p_tipo not in ('factura', 'factura_tapada', 'remito', 'contrato', 'certificado', 'otro') then
    raise exception 'Tipo de documento no válido';
  end if;

  insert into public.documents (invoice_id, subido_por, storage_path, nombre, mime, tipo, nivel_minimo)
  values (p_invoice_id, auth.uid(), p_storage_path, left(p_nombre, 200), p_mime, p_tipo, 2)
  on conflict (storage_path) do update set nombre = excluded.nombre, mime = excluded.mime, tipo = excluded.tipo
  returning id into v_id;

  if p_tipo = 'factura_tapada' then
    update public.documents set nivel_minimo = 4
      where invoice_id = p_invoice_id and reveal_id is null and tipo = 'factura';
  end if;

  perform public.log_event('documento_subido', p_invoice_id, null, 'document', v_id,
    jsonb_build_object('tipo', p_tipo));
  return v_id;
end;
$$;

grant execute on function public.registrar_documento_factura(uuid, text, text, text, text) to authenticated;

-- =========================================================================
-- ROLLBACK
-- =========================================================================
-- drop function if exists public.registrar_documento_factura(uuid, text, text, text, text),
--   public.registrar_documento_deal_room(uuid, text, text, text, text, smallint);
-- drop trigger if exists sync_documento_factura_trg on public.invoices;
-- drop function if exists public.sync_documento_factura();
-- alter table public.messages drop constraint if exists messages_document_id_fkey;
-- drop table if exists public.documents;
-- drop function if exists public.can_access_document(uuid), public.nivel_deal_room(uuid);

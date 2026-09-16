-- ViaFactoring — schema inicial
-- Marketplace de factoring: operadores de flete (fluvial/camiones) cargan
-- facturas pendientes de cobro; fondeadores (financieras, bancos, fondos,
-- inversores) navegan teasers con rangos y gastan 1 crédito para ver el
-- detalle completo (deudor, contacto, documento escaneado).
--
-- Corré esto en el SQL Editor de tu proyecto Supabase, o vía
-- `supabase db push` si usás la CLI. Ver README.md para el resto del setup.

create extension if not exists pgcrypto;

-- =========================================================================
-- 1. TABLAS
-- =========================================================================

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('operador', 'fondeador', 'admin')),
  nombre text not null,
  empresa text,
  telefono text,
  created_at timestamptz not null default now()
);

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  operador_id uuid not null references public.profiles(id) on delete cascade,
  numero text,
  rubro text not null check (rubro in ('fluvial', 'camiones')),
  deudor_nombre text not null,
  deudor_contacto text,
  monto numeric(14, 2) not null check (monto > 0),
  moneda text not null default 'USD',
  plazo_dias int not null check (plazo_dias >= 0),
  fecha_vencimiento date,
  riesgo text not null default 'medio' check (riesgo in ('bajo', 'medio', 'alto')),
  descripcion text,
  documento_url text,
  operador_contacto text,
  estado text not null default 'disponible' check (estado in ('disponible', 'cerrada', 'retirada')),
  created_at timestamptz not null default now()
);

create index invoices_operador_id_idx on public.invoices(operador_id);
create index invoices_estado_idx on public.invoices(estado);

create table public.fondeador_credits (
  fondeador_id uuid primary key references public.profiles(id) on delete cascade,
  balance int not null default 0 check (balance >= 0),
  updated_at timestamptz not null default now()
);

create table public.credit_transactions (
  id uuid primary key default gen_random_uuid(),
  fondeador_id uuid not null references public.profiles(id) on delete cascade,
  tipo text not null check (tipo in ('bienvenida', 'compra', 'consumo', 'ajuste_admin')),
  cantidad int not null,
  invoice_id uuid references public.invoices(id) on delete set null,
  admin_note text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index credit_transactions_fondeador_id_idx on public.credit_transactions(fondeador_id);

create table public.credit_packs (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  cantidad_creditos int not null check (cantidad_creditos > 0),
  precio numeric(12, 2) not null check (precio >= 0),
  moneda text not null default 'USD',
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.payment_requests (
  id uuid primary key default gen_random_uuid(),
  fondeador_id uuid not null references public.profiles(id) on delete cascade,
  pack_id uuid references public.credit_packs(id),
  monto numeric(12, 2) not null,
  moneda text not null default 'USD',
  estado text not null default 'pendiente' check (estado in ('pendiente', 'confirmado', 'cancelado')),
  payment_link text,
  metodo text,
  external_reference text,
  created_at timestamptz not null default now(),
  confirmed_at timestamptz,
  confirmed_by uuid references public.profiles(id)
);

create index payment_requests_fondeador_id_idx on public.payment_requests(fondeador_id);
create index payment_requests_estado_idx on public.payment_requests(estado);

create table public.reveals (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  fondeador_id uuid not null references public.profiles(id) on delete cascade,
  revealed_at timestamptz not null default now(),
  contactado boolean not null default false,
  bitacora text,
  unique (invoice_id, fondeador_id)
);

create index reveals_fondeador_id_idx on public.reveals(fondeador_id);
create index reveals_invoice_id_idx on public.reveals(invoice_id);

create table public.app_config (
  key text primary key,
  value text
);

insert into public.app_config (key, value) values ('welcome_credits', '3')
  on conflict (key) do nothing;

-- =========================================================================
-- 2. FUNCIONES AUXILIARES (bandas de teaser + chequeo de rol)
-- =========================================================================

-- OJO: las bandas son buckets numéricos simples sobre el monto tal cual está
-- cargado, sin conversión de moneda. Si en el futuro cargás facturas en PYG
-- o ARS mezcladas con USD, conviene normalizar a una moneda antes de
-- bandear, o definir umbrales por moneda. Para el arranque (facturas en
-- USD) alcanza.
create or replace function public.monto_banda(p_monto numeric)
returns text
language sql
immutable
as $$
  select case
    when p_monto is null then 'A confirmar'
    when p_monto < 2000 then '0 – 2.000'
    when p_monto < 5000 then '2.000 – 5.000'
    when p_monto < 10000 then '5.000 – 10.000'
    when p_monto < 25000 then '10.000 – 25.000'
    when p_monto < 50000 then '25.000 – 50.000'
    when p_monto < 100000 then '50.000 – 100.000'
    else '100.000+'
  end;
$$;

create or replace function public.plazo_banda(p_dias int)
returns text
language sql
immutable
as $$
  select case
    when p_dias is null then 'A confirmar'
    when p_dias < 15 then '0 – 15 días'
    when p_dias < 30 then '15 – 30 días'
    when p_dias < 60 then '30 – 60 días'
    when p_dias < 90 then '60 – 90 días'
    when p_dias < 120 then '90 – 120 días'
    else '120+ días'
  end;
$$;

-- SECURITY DEFINER porque una policy de RLS sobre "profiles" no puede
-- consultar la propia tabla "profiles" sin recursión. Estas funciones
-- corren con los privilegios del dueño (bypasean RLS) para resolver el rol
-- del usuario autenticado de forma segura.
create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1 from public.profiles where id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.current_role()
returns text
language sql
security definer
stable
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

grant execute on function public.is_admin() to authenticated;
grant execute on function public.current_role() to authenticated;

-- =========================================================================
-- 3. TRIGGERS: alta de perfil + créditos de bienvenida
-- =========================================================================

-- Crea la fila en public.profiles automáticamente cuando alguien se
-- registra. El rol y los datos de perfil viajan en options.data del
-- supabase.auth.signUp() del cliente (ver src/app/(auth)/signup).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text := coalesce(new.raw_user_meta_data->>'role', 'fondeador');
begin
  if v_role not in ('operador', 'fondeador') then
    v_role := 'fondeador';
  end if;

  insert into public.profiles (id, role, nombre, empresa, telefono)
  values (
    new.id,
    v_role,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'empresa',
    new.raw_user_meta_data->>'telefono'
  );
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Otorga los créditos de bienvenida configurados en app_config apenas se
-- crea un perfil de fondeador.
create or replace function public.handle_new_fondeador()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_welcome int;
begin
  if new.role = 'fondeador' then
    select value::int into v_welcome from public.app_config where key = 'welcome_credits';
    if v_welcome is null then
      v_welcome := 3;
    end if;

    insert into public.fondeador_credits (fondeador_id, balance)
    values (new.id, v_welcome)
    on conflict (fondeador_id) do nothing;

    insert into public.credit_transactions (fondeador_id, tipo, cantidad, admin_note)
    values (new.id, 'bienvenida', v_welcome, 'Créditos de bienvenida');
  end if;
  return new;
end;
$$;

drop trigger if exists on_profile_created on public.profiles;
create trigger on_profile_created
  after insert on public.profiles
  for each row execute function public.handle_new_fondeador();

-- =========================================================================
-- 4. VISTA DE TEASERS (lo único que ven los fondeadores antes de gastar
--    un crédito: rangos, nunca valores exactos)
-- =========================================================================

create view public.invoice_teasers
with (security_invoker = false)
as
select
  i.id,
  i.rubro,
  public.monto_banda(i.monto) as monto_banda,
  public.plazo_banda(i.plazo_dias) as plazo_banda,
  i.riesgo,
  i.descripcion,
  i.estado,
  i.created_at,
  exists (
    select 1 from public.reveals r
    where r.invoice_id = i.id and r.fondeador_id = auth.uid()
  ) as ya_revelada
from public.invoices i
where i.estado = 'disponible'
   or exists (
        select 1 from public.reveals r
        where r.invoice_id = i.id and r.fondeador_id = auth.uid()
      );

grant select on public.invoice_teasers to authenticated;

-- =========================================================================
-- 5. RPCs (mutaciones sensibles: gastar un crédito, confirmar un pago,
--    ajustar créditos a mano)
-- =========================================================================

-- Revela una factura para el fondeador autenticado: si ya la había
-- revelado antes, devuelve el detalle completo sin volver a cobrar
-- (idempotente). Si no, descuenta 1 crédito de forma atómica (con lock de
-- fila) y deja registro en credit_transactions + reveals.
create or replace function public.reveal_invoice(p_invoice_id uuid)
returns public.invoices
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_invoice public.invoices;
  v_existing public.reveals;
  v_balance int;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is distinct from 'fondeador' then
    raise exception 'Solo los fondeadores pueden destrabar facturas';
  end if;

  select * into v_invoice from public.invoices where id = p_invoice_id;
  if not found then
    raise exception 'Factura no encontrada';
  end if;

  select * into v_existing from public.reveals
    where invoice_id = p_invoice_id and fondeador_id = auth.uid();
  if found then
    return v_invoice;
  end if;

  select balance into v_balance
    from public.fondeador_credits
    where fondeador_id = auth.uid()
    for update;

  if v_balance is null or v_balance < 1 then
    raise exception 'No tenés créditos suficientes para destrabar esta factura';
  end if;

  update public.fondeador_credits
    set balance = balance - 1, updated_at = now()
    where fondeador_id = auth.uid();

  insert into public.credit_transactions (fondeador_id, tipo, cantidad, invoice_id)
    values (auth.uid(), 'consumo', -1, p_invoice_id);

  insert into public.reveals (invoice_id, fondeador_id)
    values (p_invoice_id, auth.uid());

  return v_invoice;
end;
$$;

grant execute on function public.reveal_invoice(uuid) to authenticated;

-- Confirma un payment_request (hoy: vos confirmás a mano que llegó la
-- transferencia/link externo; mañana: la puede llamar un webhook de
-- MercadoPago/Stripe con un service-role client). Acredita el pack de una
-- sola vez, de forma idempotente.
create or replace function public.confirm_payment_request(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.payment_requests;
  v_pack public.credit_packs;
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede confirmar pagos';
  end if;

  select * into v_req from public.payment_requests where id = p_request_id for update;
  if not found then
    raise exception 'Solicitud de pago no encontrada';
  end if;

  if v_req.estado = 'confirmado' then
    return;
  end if;

  update public.payment_requests
    set estado = 'confirmado', confirmed_at = now(), confirmed_by = auth.uid()
    where id = p_request_id;

  if v_req.pack_id is not null then
    select * into v_pack from public.credit_packs where id = v_req.pack_id;
  end if;

  insert into public.fondeador_credits (fondeador_id, balance)
    values (v_req.fondeador_id, coalesce(v_pack.cantidad_creditos, 0))
  on conflict (fondeador_id) do update
    set balance = public.fondeador_credits.balance + coalesce(v_pack.cantidad_creditos, 0),
        updated_at = now();

  insert into public.credit_transactions (fondeador_id, tipo, cantidad, admin_note, created_by)
    values (
      v_req.fondeador_id,
      'compra',
      coalesce(v_pack.cantidad_creditos, 0),
      'Pago confirmado: ' || coalesce(v_pack.nombre, 'pack'),
      auth.uid()
    );
end;
$$;

grant execute on function public.confirm_payment_request(uuid) to authenticated;

-- Ajuste manual de créditos por parte del admin (positivo o negativo),
-- para casos fuera del flujo normal de compra.
create or replace function public.admin_adjust_credit(
  p_fondeador_id uuid,
  p_cantidad int,
  p_nota text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede ajustar créditos';
  end if;

  insert into public.fondeador_credits (fondeador_id, balance)
    values (p_fondeador_id, greatest(p_cantidad, 0))
  on conflict (fondeador_id) do update
    set balance = greatest(public.fondeador_credits.balance + p_cantidad, 0),
        updated_at = now();

  insert into public.credit_transactions (fondeador_id, tipo, cantidad, admin_note, created_by)
    values (p_fondeador_id, 'ajuste_admin', p_cantidad, p_nota, auth.uid());
end;
$$;

grant execute on function public.admin_adjust_credit(uuid, int, text) to authenticated;

-- =========================================================================
-- 6. ROW LEVEL SECURITY
-- =========================================================================

alter table public.profiles enable row level security;
alter table public.invoices enable row level security;
alter table public.fondeador_credits enable row level security;
alter table public.credit_transactions enable row level security;
alter table public.credit_packs enable row level security;
alter table public.payment_requests enable row level security;
alter table public.reveals enable row level security;
alter table public.app_config enable row level security;

-- profiles: cada quien ve/edita su propia fila; el admin ve todas. El
-- alta la hace el trigger (SECURITY DEFINER), no hace falta policy de insert.
create policy "profiles_select_own_or_admin" on public.profiles
  for select using (id = auth.uid() or public.is_admin());

create policy "profiles_update_own_or_admin" on public.profiles
  for update using (id = auth.uid() or public.is_admin());

-- invoices: el operador dueño y el admin tienen acceso directo a la fila
-- completa. Los fondeadores NUNCA leen esta tabla directo — solo a través
-- de la vista invoice_teasers (rangos) o de reveal_invoice() (detalle,
-- pagando 1 crédito).
create policy "invoices_select_owner_or_admin" on public.invoices
  for select using (operador_id = auth.uid() or public.is_admin());

create policy "invoices_insert_own" on public.invoices
  for insert with check (
    operador_id = auth.uid() and public.current_role() = 'operador'
  );

create policy "invoices_update_owner_or_admin" on public.invoices
  for update using (operador_id = auth.uid() or public.is_admin());

-- fondeador_credits: cada fondeador ve su propio saldo; el admin ve todos.
-- No hay policy de insert/update para el cliente: el saldo solo se toca
-- desde las RPCs de arriba (SECURITY DEFINER).
create policy "fondeador_credits_select_own_or_admin" on public.fondeador_credits
  for select using (fondeador_id = auth.uid() or public.is_admin());

-- credit_transactions: historial propio, o todo para el admin.
create policy "credit_transactions_select_own_or_admin" on public.credit_transactions
  for select using (fondeador_id = auth.uid() or public.is_admin());

-- credit_packs: cualquier usuario autenticado ve los packs activos; el
-- admin ve y administra todos.
create policy "credit_packs_select_active_or_admin" on public.credit_packs
  for select using (activo = true or public.is_admin());

create policy "credit_packs_admin_write" on public.credit_packs
  for all using (public.is_admin()) with check (public.is_admin());

-- payment_requests: el fondeador crea sus propias solicitudes y ve su
-- propio historial; el admin ve y confirma todas.
create policy "payment_requests_select_own_or_admin" on public.payment_requests
  for select using (fondeador_id = auth.uid() or public.is_admin());

create policy "payment_requests_insert_own" on public.payment_requests
  for insert with check (
    fondeador_id = auth.uid() and public.current_role() = 'fondeador'
  );

create policy "payment_requests_admin_update" on public.payment_requests
  for update using (public.is_admin()) with check (public.is_admin());

-- reveals: el fondeador ve y anota (bitácora/contactado) sus propias
-- revelaciones; el admin ve todas. El insert SOLO ocurre dentro de
-- reveal_invoke() (SECURITY DEFINER) — un fondeador no puede insertar acá
-- directo y "revelar gratis".
create policy "reveals_select_own_or_admin" on public.reveals
  for select using (fondeador_id = auth.uid() or public.is_admin());

create policy "reveals_update_own_or_admin" on public.reveals
  for update using (fondeador_id = auth.uid() or public.is_admin());

-- app_config: solo el admin.
create policy "app_config_admin_only" on public.app_config
  for all using (public.is_admin()) with check (public.is_admin());

-- =========================================================================
-- 7. STORAGE: documentos de factura (privado; se sirven vía signed URL)
-- =========================================================================

insert into storage.buckets (id, name, public)
values ('facturas', 'facturas', false)
on conflict (id) do nothing;

-- Convención de path: {operador_id}/{invoice_id}/{filename}
-- Solo el operador dueño de la carpeta y el admin pueden leer/escribir
-- directo. Los fondeadores NUNCA acceden al bucket directo: reciben una
-- signed URL de corta duración generada server-side (service role) recién
-- después de un reveal_invoice() exitoso — ver src/app/fondeador/facturas.
create policy "facturas_owner_rw" on storage.objects
  for all using (
    bucket_id = 'facturas'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  )
  with check (
    bucket_id = 'facturas'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or public.is_admin()
    )
  );

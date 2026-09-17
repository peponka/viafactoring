-- ViaFactoring — ofertas y comisión de cierre (Deal Fee)
--
-- Agrega la capa de "oferta -> aceptación" para que cerrar un trato sea un
-- evento real adentro de la plataforma (no un autoreporte de algo que ya
-- pasó afuera). El fondeador, después de destrabar una factura, puede
-- ofertar un monto de anticipo. Si el operador acepta esa oferta ACÁ
-- adentro, se genera automáticamente una solicitud de pago de "comisión"
-- (Deal Fee) para el fondeador, con el mismo mecanismo manual de siempre
-- (vos mandás el link, confirmás cuando cobra). ViaFactoring nunca toca la
-- plata de la factura en sí — la transferencia sigue siendo directa entre
-- fondeador y operador.
--
-- Corré esto en el SQL Editor de Supabase DESPUÉS de 0001_init.sql.

-- =========================================================================
-- 1. TABLA DE OFERTAS
-- =========================================================================

create table public.offers (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  fondeador_id uuid not null references public.profiles(id) on delete cascade,
  monto_ofrecido numeric(14, 2) not null check (monto_ofrecido > 0),
  mensaje text,
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aceptada', 'rechazada')),
  created_at timestamptz not null default now(),
  respondida_at timestamptz,
  unique (invoice_id, fondeador_id)
);

create index offers_invoice_id_idx on public.offers(invoice_id);
create index offers_fondeador_id_idx on public.offers(fondeador_id);

-- =========================================================================
-- 2. payment_requests: distinguir compra de créditos vs. comisión de cierre
-- =========================================================================

alter table public.payment_requests
  add column tipo text not null default 'creditos' check (tipo in ('creditos', 'comision'));

alter table public.payment_requests
  add column offer_id uuid references public.offers(id) on delete set null;

create index payment_requests_offer_id_idx on public.payment_requests(offer_id);

-- =========================================================================
-- 3. Tabla de tarifas del Deal Fee (fija según el tamaño de la factura, no
--    porcentaje — todavía no sabemos cuánto vale realmente cada operación,
--    así que arrancamos simple y ajustable).
-- =========================================================================

create or replace function public.deal_fee_for_monto(p_monto numeric)
returns numeric
language sql
immutable
as $$
  select case
    when p_monto is null then 0
    when p_monto < 5000 then 25
    when p_monto < 25000 then 50
    when p_monto < 50000 then 100
    when p_monto < 100000 then 200
    when p_monto < 250000 then 350
    else 500
  end;
$$;

-- =========================================================================
-- 4. RPCs: hacer una oferta, responderla (aceptar dispara el Deal Fee)
-- =========================================================================

-- El fondeador hace (o actualiza) su oferta sobre una factura que ya
-- destrabó. Si ya tenía una oferta pendiente o rechazada para esa factura,
-- la reemplaza (vuelve a 'pendiente'). Si ya fue aceptada, no se puede
-- tocar más.
create or replace function public.create_offer(
  p_invoice_id uuid,
  p_monto_ofrecido numeric,
  p_mensaje text default null
)
returns public.offers
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_invoice public.invoices;
  v_offer public.offers;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is distinct from 'fondeador' then
    raise exception 'Solo los fondeadores pueden hacer ofertas';
  end if;

  if p_monto_ofrecido is null or p_monto_ofrecido <= 0 then
    raise exception 'El monto ofrecido tiene que ser mayor a 0';
  end if;

  select * into v_invoice from public.invoices where id = p_invoice_id;
  if not found then
    raise exception 'Factura no encontrada';
  end if;

  if v_invoice.estado <> 'disponible' then
    raise exception 'Esta factura ya no está disponible';
  end if;

  if not exists (
    select 1 from public.reveals
    where invoice_id = p_invoice_id and fondeador_id = auth.uid()
  ) then
    raise exception 'Tenés que destrabar la factura antes de ofertar';
  end if;

  insert into public.offers (invoice_id, fondeador_id, monto_ofrecido, mensaje)
  values (p_invoice_id, auth.uid(), p_monto_ofrecido, p_mensaje)
  on conflict (invoice_id, fondeador_id) do update
    set monto_ofrecido = excluded.monto_ofrecido,
        mensaje = excluded.mensaje,
        estado = 'pendiente',
        respondida_at = null,
        created_at = now()
    where public.offers.estado <> 'aceptada'
  returning * into v_offer;

  if v_offer.id is null then
    raise exception 'Esa oferta ya fue aceptada, no se puede modificar';
  end if;

  return v_offer;
end;
$$;

grant execute on function public.create_offer(uuid, numeric, text) to authenticated;

-- El operador dueño de la factura acepta o rechaza una oferta. Aceptar
-- cierra la factura (estado 'cerrada'), rechaza automáticamente cualquier
-- otra oferta pendiente de la misma factura, y genera un payment_request
-- tipo 'comision' para el fondeador — el mismo flujo manual de siempre
-- (vos mandás el link de pago y confirmás cuando cobra). La transferencia
-- de la factura en sí sigue siendo directa entre fondeador y operador.
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
  v_fee numeric;
begin
  select * into v_offer from public.offers where id = p_offer_id for update;
  if not found then
    raise exception 'Oferta no encontrada';
  end if;

  select * into v_invoice from public.invoices where id = v_offer.invoice_id;
  if v_invoice.operador_id is distinct from auth.uid() then
    raise exception 'Solo el operador dueño de la factura puede responder esta oferta';
  end if;

  if v_offer.estado <> 'pendiente' then
    raise exception 'Esta oferta ya fue respondida';
  end if;

  if p_accept then
    update public.offers
      set estado = 'aceptada', respondida_at = now()
      where id = p_offer_id;

    update public.offers
      set estado = 'rechazada', respondida_at = now()
      where invoice_id = v_offer.invoice_id
        and id <> p_offer_id
        and estado = 'pendiente';

    update public.invoices set estado = 'cerrada' where id = v_offer.invoice_id;

    v_fee := public.deal_fee_for_monto(v_offer.monto_ofrecido);

    insert into public.payment_requests
      (fondeador_id, monto, moneda, tipo, offer_id, estado)
    values
      (v_offer.fondeador_id, v_fee, v_invoice.moneda, 'comision', p_offer_id, 'pendiente');
  else
    update public.offers
      set estado = 'rechazada', respondida_at = now()
      where id = p_offer_id;
  end if;

  select * into v_offer from public.offers where id = p_offer_id;
  return v_offer;
end;
$$;

grant execute on function public.respond_offer(uuid, boolean) to authenticated;

-- =========================================================================
-- 5. ROW LEVEL SECURITY
-- =========================================================================

alter table public.offers enable row level security;

-- El fondeador ve sus propias ofertas; el operador ve las ofertas sobre sus
-- propias facturas; el admin ve todas. No hay policy de insert/update: eso
-- SOLO ocurre dentro de create_offer()/respond_offer() (SECURITY DEFINER),
-- mismo patrón que reveals.
create policy "offers_select_involved_or_admin" on public.offers
  for select using (
    fondeador_id = auth.uid()
    or exists (
      select 1 from public.invoices i
      where i.id = offers.invoice_id and i.operador_id = auth.uid()
    )
    or public.is_admin()
  );

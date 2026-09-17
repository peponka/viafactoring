-- ViaFactoring — modelo de "desbloqueo de operación" (reemplaza créditos)
--
-- Cambio de fondo: en vez de comprar créditos sueltos y gastar 1 por
-- factura, el fondeador ve la ficha pública GRATIS (monto exacto, plazo,
-- vencimiento, rubro, riesgo) pero nunca el deudor, el contacto ni el
-- documento. Para eso paga una tarifa de desbloqueo escalonada según el
-- monto de la operación (tabla abajo). El pago se confirma a mano por el
-- admin (igual que hoy), y recién ahí se graba una fila en `reveals` que
-- habilita el detalle completo — el mismo mecanismo de gating que ya
-- existía, solo que ahora el gate es un pago por operación, no un crédito
-- genérico.
--
-- El código de créditos (fondeador_credits, credit_transactions,
-- credit_packs, reveal_invoice cobrando 1 crédito) NO se borra — queda
-- inerte por si en algún momento se quiere retomar. Solo se deja de usar
-- desde el frontend.

-- =========================================================================
-- 1. TARIFA DE DESBLOQUEO (tabla escalonada por monto de la operación)
-- =========================================================================

create or replace function public.unlock_fee_for_monto(p_monto numeric)
returns numeric
language sql
immutable
as $$
  select case
    when p_monto is null then 100
    when p_monto <= 10000 then 100
    when p_monto <= 25000 then 200
    when p_monto <= 50000 then 300
    when p_monto <= 100000 then 450
    when p_monto <= 250000 then 650
    else 900
  end;
$$;

grant execute on function public.unlock_fee_for_monto(numeric) to authenticated;

-- =========================================================================
-- 2. payment_requests: agregar invoice_id + tipo 'desbloqueo'
-- =========================================================================

alter table public.payment_requests
  add column if not exists invoice_id uuid references public.invoices(id) on delete set null;

create index if not exists payment_requests_invoice_id_idx
  on public.payment_requests(invoice_id);

alter table public.payment_requests drop constraint if exists payment_requests_tipo_check;
alter table public.payment_requests
  add constraint payment_requests_tipo_check
  check (tipo in ('creditos', 'comision', 'desbloqueo'));

-- El insert directo desde el cliente (usado hoy por la compra de packs de
-- créditos) queda restringido a tipo='creditos'. Las solicitudes de
-- desbloqueo y comisión SOLO se crean desde las RPCs de abajo
-- (SECURITY DEFINER), que calculan el monto server-side — así un fondeador
-- no puede insertar un payment_request de tipo 'desbloqueo' con el monto
-- que quiera.
drop policy if exists "payment_requests_insert_own" on public.payment_requests;
create policy "payment_requests_insert_own" on public.payment_requests
  for insert with check (
    fondeador_id = auth.uid()
    and public.current_role() = 'fondeador'
    and tipo = 'creditos'
  );

-- =========================================================================
-- 3. Solicitar el desbloqueo de una operación (crea el payment_request)
-- =========================================================================

create or replace function public.solicitar_desbloqueo(p_invoice_id uuid)
returns public.payment_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
  v_invoice public.invoices;
  v_existing_reveal public.reveals;
  v_existing_req public.payment_requests;
  v_fee numeric;
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is distinct from 'fondeador' then
    raise exception 'Solo los fondeadores pueden desbloquear operaciones';
  end if;

  select * into v_invoice from public.invoices where id = p_invoice_id;
  if not found then
    raise exception 'Operación no encontrada';
  end if;

  select * into v_existing_reveal from public.reveals
    where invoice_id = p_invoice_id and fondeador_id = auth.uid();
  if found then
    raise exception 'Ya desbloqueaste esta operación';
  end if;

  if v_invoice.estado <> 'disponible' then
    raise exception 'Esta operación ya no está disponible';
  end if;

  -- Idempotente: si ya hay una solicitud pendiente o confirmada para esta
  -- operación, no crear otra — devolver la existente.
  select * into v_existing_req from public.payment_requests
    where invoice_id = p_invoice_id
      and fondeador_id = auth.uid()
      and tipo = 'desbloqueo'
      and estado in ('pendiente', 'confirmado')
    order by created_at desc
    limit 1;
  if found then
    return v_existing_req;
  end if;

  v_fee := public.unlock_fee_for_monto(v_invoice.monto);

  insert into public.payment_requests (fondeador_id, invoice_id, monto, moneda, tipo)
    values (auth.uid(), p_invoice_id, v_fee, v_invoice.moneda, 'desbloqueo')
    returning * into v_existing_req;

  return v_existing_req;
end;
$$;

grant execute on function public.solicitar_desbloqueo(uuid) to authenticated;

-- =========================================================================
-- 4. confirm_payment_request: ramificar según tipo
--    - 'desbloqueo' → graba la fila en reveals (habilita el expediente)
--    - 'creditos'   → comportamiento viejo, intacto (por si se reactiva)
-- =========================================================================

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

  if v_req.tipo = 'desbloqueo' and v_req.invoice_id is not null then
    insert into public.reveals (invoice_id, fondeador_id)
      values (v_req.invoice_id, v_req.fondeador_id)
      on conflict (invoice_id, fondeador_id) do nothing;
    return;
  end if;

  if v_req.tipo = 'comision' then
    -- Nada más que hacer: el estado 'confirmado' ya es el registro de que
    -- la comisión de cierre se cobró.
    return;
  end if;

  -- tipo = 'creditos' (flujo viejo, se deja intacto)
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

-- =========================================================================
-- 5. reveal_invoice: ya NO cobra crédito — solo devuelve el detalle si ya
--    existe una fila en reveals (es decir, si el desbloqueo ya fue pagado
--    y confirmado). Este es el único camino por el que el detalle completo
--    (deudor, contacto, documento) sale del backend.
-- =========================================================================

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
begin
  select role into v_role from public.profiles where id = auth.uid();
  if v_role is distinct from 'fondeador' then
    raise exception 'Solo los fondeadores pueden ver el detalle completo';
  end if;

  select * into v_invoice from public.invoices where id = p_invoice_id;
  if not found then
    raise exception 'Operación no encontrada';
  end if;

  select * into v_existing from public.reveals
    where invoice_id = p_invoice_id and fondeador_id = auth.uid();
  if not found then
    raise exception 'Todavía no desbloqueaste esta operación';
  end if;

  return v_invoice;
end;
$$;

-- =========================================================================
-- 6. Ficha pública (invoice_teasers): ahora con monto/plazo/vencimiento
--    EXACTOS (no bandas) — pero nunca deudor, contacto ni documento.
--    Se agrega unlock_fee calculado server-side para que el frontend no
--    tenga que duplicar la lógica de la tabla escalonada.
-- =========================================================================

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
  i.descripcion,
  i.estado,
  i.created_at,
  public.unlock_fee_for_monto(i.monto) as unlock_fee,
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

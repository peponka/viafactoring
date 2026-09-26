-- ViaFactoring — 0010: base multirrubro (core + industry module)
--
-- Definiciones de campos: relacionales (industries + industry_fields).
-- Valores: JSONB en invoices.industry_data, validado en la base.
-- Campos que sirven a todas las industrias: columnas del core (ubicacion).
--
-- Compatible con la app actual: si una factura llega solo con `rubro`
-- (como hoy), la base le asigna la industria automáticamente.
-- Requiere 0007 (detectar_contacto).

-- =========================================================================
-- 1. Catálogo
-- =========================================================================

create table public.industries (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]+$'),
  nombre text not null,
  parent_id uuid references public.industries(id) on delete restrict,
  activo boolean not null default false,
  orden int not null default 0,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.industry_fields (
  id uuid primary key default gen_random_uuid(),
  industry_id uuid not null references public.industries(id) on delete cascade,
  key text not null check (key ~ '^[a-z][a-z0-9_]*$'),
  label text not null,
  tipo text not null check (tipo in ('text', 'textarea', 'number', 'date', 'select', 'boolean')),
  requerido boolean not null default false,
  opciones jsonb check (opciones is null or jsonb_typeof(opciones) = 'array'),
  orden int not null default 0,
  activo boolean not null default true,
  -- 1 = se ve en el marketplace público; 2 = solo después del desbloqueo
  visibilidad smallint not null default 2 check (visibilidad in (1, 2)),
  -- si el fondeador puede usarlo en sus preferencias y en el matching
  filtrable boolean not null default false,
  created_at timestamptz not null default now(),
  unique (industry_id, key)
);

alter table public.industries enable row level security;
alter table public.industry_fields enable row level security;

create policy "industries_select_all" on public.industries for select using (true);
create policy "industries_admin_write" on public.industries
  for all using (public.is_admin()) with check (public.is_admin());
create policy "industry_fields_select_all" on public.industry_fields for select using (true);
create policy "industry_fields_admin_write" on public.industry_fields
  for all using (public.is_admin()) with check (public.is_admin());

-- Rubros de la lista de producto. Solo transporte y "otros" arrancan
-- activos; el resto existe en el catálogo pero inactivo hasta que se
-- cumpla la regla (un fondeador que lo pida + una PyME lista).
insert into public.industries (slug, nombre, activo, orden) values
  ('transporte', 'Transporte', true, 10),
  ('logistica', 'Logística', false, 20),
  ('distribucion', 'Distribución', false, 30),
  ('proveedores-grandes-empresas', 'Proveedores de grandes empresas', false, 40),
  ('exportadores', 'Exportadores', false, 50),
  ('importadores', 'Importadores', false, 60),
  ('construccion', 'Construcción', false, 70),
  ('agroindustria', 'Agroindustria', false, 80),
  ('servicios-profesionales', 'Servicios profesionales', false, 90),
  ('comercio-mayorista', 'Comercio mayorista', false, 100),
  ('proveedores-industriales', 'Proveedores industriales', false, 110),
  ('otros', 'Otros', true, 999);

insert into public.industries (slug, nombre, parent_id, activo, orden)
select v.slug, v.nombre, p.id, true, v.orden
from (values ('transporte-fluvial', 'Transporte fluvial', 1),
             ('transporte-terrestre', 'Transporte terrestre', 2)) v(slug, nombre, orden)
cross join public.industries p where p.slug = 'transporte';

-- Campos de ejemplo del documento de producto. Quedan INACTIVOS: se
-- activan después de validarlos con los primeros operadores y fondeadores.
insert into public.industry_fields (industry_id, key, label, tipo, opciones, orden, activo, visibilidad, filtrable)
select i.id, f.key, f.label, f.tipo, f.opciones::jsonb, f.orden, false, f.visibilidad, f.filtrable
from public.industries i
join (values
  ('transporte', 'origen', 'Origen', 'text', null, 1, 1, true),
  ('transporte', 'destino', 'Destino', 'text', null, 2, 1, true),
  ('transporte', 'tipo_carga', 'Tipo de carga', 'text', null, 3, 1, true),
  ('transporte', 'toneladas', 'Toneladas', 'number', null, 4, 1, false),
  ('transporte', 'viaje', 'Viaje / referencia', 'text', null, 5, 2, false),
  ('transporte-fluvial', 'tipo_embarcacion', 'Tipo de embarcación', 'text', null, 6, 1, true),
  ('transporte-terrestre', 'vehiculo', 'Vehículo', 'text', null, 6, 1, true)
) f(slug, key, label, tipo, opciones, orden, visibilidad, filtrable) on f.slug = i.slug;

-- =========================================================================
-- 2. invoices
-- =========================================================================

alter table public.invoices
  add column industry_id uuid references public.industries(id),
  add column industry_data jsonb not null default '{}'::jsonb,
  add column ubicacion text;

create index invoices_industry_id_idx on public.invoices(industry_id);

-- Industria y sus ancestros (una subindustria hereda los campos del padre)
create or replace function public.industry_linaje(p_industry_id uuid)
returns table (id uuid)
language sql
stable
as $$
  with recursive l as (
    select i.id, i.parent_id from public.industries i where i.id = p_industry_id
    union all
    select p.id, p.parent_id from public.industries p join l on p.id = l.parent_id
  )
  select l.id from l;
$$;

create or replace function public.industria_desde_rubro(p_rubro text)
returns uuid
language sql
stable
as $$
  select id from public.industries where slug = case
    when lower(coalesce(p_rubro, '')) ~ '(fluvial|barcaz|remolc|naviera|hidrov)' then 'transporte-fluvial'
    when lower(coalesce(p_rubro, '')) ~ '(cami[oó]n|camiones|terrestre|flete)' then 'transporte-terrestre'
    when lower(coalesce(p_rubro, '')) ~ 'transport' then 'transporte'
    else 'otros'
  end;
$$;

update public.invoices set industry_id = public.industria_desde_rubro(rubro) where industry_id is null;

-- Validación de industry_data contra la definición de campos
create or replace function public.invoices_industry_check()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  f record;
  v jsonb;
  k text;
begin
  if new.industry_id is null then
    new.industry_id := public.industria_desde_rubro(new.rubro);
  end if;

  if tg_op = 'UPDATE'
     and new.industry_data is not distinct from old.industry_data
     and new.industry_id is not distinct from old.industry_id then
    return new;
  end if;

  new.industry_data := coalesce(new.industry_data, '{}'::jsonb);
  if jsonb_typeof(new.industry_data) <> 'object' then
    raise exception 'industry_data tiene que ser un objeto';
  end if;

  -- claves desconocidas o de campos inactivos
  for k in select jsonb_object_keys(new.industry_data) loop
    if not exists (
      select 1 from public.industry_fields fi
      where fi.key = k and fi.activo
        and fi.industry_id in (select id from public.industry_linaje(new.industry_id))
    ) then
      raise exception 'Campo desconocido para esta industria: %', k;
    end if;
  end loop;

  for f in
    select fi.* from public.industry_fields fi
    where fi.activo and fi.industry_id in (select id from public.industry_linaje(new.industry_id))
  loop
    v := new.industry_data -> f.key;

    if v is null or v = 'null'::jsonb or (jsonb_typeof(v) = 'string' and trim(v #>> '{}') = '') then
      if f.requerido then
        raise exception 'Falta completar: %', f.label;
      end if;
      continue;
    end if;

    if f.tipo = 'number' and jsonb_typeof(v) <> 'number' then
      raise exception '% tiene que ser un número', f.label;
    elsif f.tipo = 'boolean' and jsonb_typeof(v) <> 'boolean' then
      raise exception '% tiene que ser sí o no', f.label;
    elsif f.tipo in ('text', 'textarea', 'date', 'select') and jsonb_typeof(v) <> 'string' then
      raise exception '% tiene que ser texto', f.label;
    end if;

    if f.tipo = 'date' then
      begin
        perform (v #>> '{}')::date;
      exception when others then
        raise exception '% tiene que ser una fecha válida', f.label;
      end;
    end if;

    if f.tipo = 'select' and not (coalesce(f.opciones, '[]'::jsonb) ? (v #>> '{}')) then
      raise exception '% tiene un valor fuera de las opciones', f.label;
    end if;

    if f.tipo in ('text', 'textarea') and length(v #>> '{}') > 2000 then
      raise exception '% es demasiado largo', f.label;
    end if;

    -- Los campos públicos no pueden llevar datos de contacto
    if f.visibilidad = 1 and f.tipo in ('text', 'textarea')
       and cardinality(public.detectar_contacto(v #>> '{}')) > 0 then
      raise exception '% es público: no puede incluir teléfonos, emails ni links', f.label;
    end if;
  end loop;

  return new;
end;
$$;

create trigger invoices_industry_check_trg
  before insert or update on public.invoices
  for each row execute function public.invoices_industry_check();

-- Solo los campos públicos (visibilidad 1) para el marketplace
create or replace function public.public_industry_data(p_industry_id uuid, p_data jsonb)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(jsonb_object_agg(fi.key, p_data -> fi.key), '{}'::jsonb)
  from public.industry_fields fi
  where fi.activo and fi.visibilidad = 1
    and fi.industry_id in (select id from public.industry_linaje(p_industry_id))
    and p_data ? fi.key;
$$;

-- =========================================================================
-- 3. Vista pública del marketplace
--    Se agregan columnas al final (compatible con el front actual) y la
--    descripción deja de publicarse si trae datos de contacto.
-- =========================================================================

-- drop + create (en vez de replace) para no depender del orden exacto de
-- columnas que tenga hoy la vista en producción.
drop view if exists public.invoice_teasers;
create view public.invoice_teasers
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
  public.unlock_fee_for_monto(i.monto) as unlock_fee,
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
-- ROLLBACK
-- =========================================================================
-- (re-crear invoice_teasers con la definición de 0003)
-- drop trigger if exists invoices_industry_check_trg on public.invoices;
-- drop function if exists public.invoices_industry_check(), public.public_industry_data(uuid, jsonb),
--   public.industria_desde_rubro(text), public.industry_linaje(uuid);
-- alter table public.invoices drop column industry_id, drop column industry_data, drop column ubicacion;
-- drop table if exists public.industry_fields; drop table if exists public.industries;

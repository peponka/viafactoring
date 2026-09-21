-- ViaFactoring — abrir el rubro de la factura a cualquier tipo, no solo
-- fluvial/camiones. El campo pasa a ser texto libre (con esas dos opciones
-- todavía sugeridas en el formulario, entre otras).
--
-- Corré esto en el SQL Editor de tu proyecto Supabase después del resto de
-- las migraciones. Busca dinámicamente el nombre real del constraint viejo
-- (por si no es el auto-generado invoices_rubro_check) en vez de asumirlo.

do $$
declare
  c record;
begin
  for c in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_attribute att on att.attrelid = rel.oid
    where rel.relname = 'invoices'
      and con.contype = 'c'
      and att.attname = 'rubro'
      and att.attnum = any(con.conkey)
  loop
    execute format('alter table public.invoices drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.invoices
  add constraint invoices_rubro_check check (length(trim(rubro)) > 0);

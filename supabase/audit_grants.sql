-- Auditoría de exposición de tablas en public a la Data API.
-- Solo lectura: se puede correr tal cual en el SQL Editor de Supabase.
-- Ordena primero lo más riesgoso.

with t as (
  select c.oid, c.relname as tabla, c.relrowsecurity as rls
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('r', 'p')
),
p as (
  select
    tabla, rls,
    (select count(*) from pg_policies pol
       where pol.schemaname = 'public' and pol.tablename = t.tabla) as policies,
    has_table_privilege('anon', oid, 'SELECT')          as anon_select,
    has_table_privilege('anon', oid, 'INSERT')
      or has_table_privilege('anon', oid, 'UPDATE')
      or has_table_privilege('anon', oid, 'DELETE')     as anon_escritura,
    has_table_privilege('authenticated', oid, 'SELECT') as auth_select,
    has_table_privilege('authenticated', oid, 'INSERT')
      or has_table_privilege('authenticated', oid, 'UPDATE')
      or has_table_privilege('authenticated', oid, 'DELETE') as auth_escritura,
    has_table_privilege('service_role', oid, 'SELECT')  as service_select
  from t
)
select
  tabla,
  case
    when not rls and (anon_select or anon_escritura)   then '1 CRITICO: sin RLS y visible para anon'
    when not rls and (auth_select or auth_escritura)   then '2 ALTO: sin RLS y visible para authenticated'
    when rls and policies = 0 and (anon_select or auth_select) then '3 OK-bloqueada: RLS sin policies (nadie lee por API)'
    when anon_escritura                                 then '4 REVISAR: anon puede escribir (depende de policies)'
    when anon_select                                    then '5 REVISAR: anon puede leer (depende de policies)'
    when not (auth_select or service_select)            then '6 SIN GRANTS: la API no la ve'
    else '7 OK'
  end as estado,
  rls, policies, anon_select, anon_escritura, auth_select, auth_escritura, service_select
from p
order by estado, tabla;

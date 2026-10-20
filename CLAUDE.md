@AGENTS.md

## Supabase: grants explícitos en tablas nuevas (obligatorio desde 2026-10-30)

Desde el 30/10/2026 Supabase ya no le da acceso automático a la Data API (supabase-js, PostgREST, GraphQL) a las tablas nuevas del schema `public`. Sin grant, la API devuelve `permission denied`. Las tablas que ya existían en producción no cambian.

Cada vez que crees una tabla en `public`, en el **mismo archivo SQL** que el `create table`:

1. Habilitá RLS y escribí las policies:
   ```sql
   alter table public.mi_tabla enable row level security;
   ```
2. Dale grants explícitos, con el mínimo necesario:
   ```sql
   -- Solo si la tabla se lee sin login (catálogos, precios públicos, horarios disponibles, etc.)
   grant select on public.mi_tabla to anon;

   -- Usuarios logueados: solo los permisos que la app realmente usa
   grant select, insert, update, delete on public.mi_tabla to authenticated;

   -- Backend / edge functions / cron
   grant select, insert, update, delete on public.mi_tabla to service_role;
   ```
3. Si la tabla usa `serial`/`bigserial` (no `identity`), dale también la secuencia a quien inserte:
   ```sql
   grant usage, select on sequence public.mi_tabla_id_seq to authenticated, service_role;
   ```

Reglas:
- Nunca `grant insert/update/delete ... to anon`, salvo un formulario público explícito (y con policy que lo limite).
- El grant no reemplaza a RLS: el grant abre la puerta, las policies filtran filas. Siempre los dos.
- No usar `alter default privileges ... grant` para volver al comportamiento viejo.
- Para revisar qué está expuesto, correr `supabase/audit_grants.sql` en el SQL Editor (solo lectura).

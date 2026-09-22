-- 1) Le suma el email a profiles (hasta ahora solo vivía en auth.users,
--    que la app no puede leer con la clave anon). Sirve para que el panel
--    de admin pueda mostrar el contacto completo de cada operador y
--    fondeador sin tener que usar la service role key.
alter table public.profiles
  add column if not exists email text;

update public.profiles p
set email = u.email
from auth.users u
where u.id = p.id
  and p.email is null;

-- 2) De acá en más, cada perfil nuevo se crea ya con su email.
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

  insert into public.profiles (id, role, nombre, empresa, telefono, email)
  values (
    new.id,
    v_role,
    coalesce(new.raw_user_meta_data->>'nombre', split_part(new.email, '@', 1)),
    new.raw_user_meta_data->>'empresa',
    new.raw_user_meta_data->>'telefono',
    new.email
  );
  return new;
end;
$$;

-- 3) Te marca a vos como admin — sos el único dueño del proyecto y el
--    admin nunca se puede crear desde el formulario de registro (ver
--    signUpAction, que solo acepta 'operador' o 'fondeador'), así que se
--    asigna a mano acá.
update public.profiles
set role = 'admin'
where id = (select id from auth.users where email = 'pepeq68@gmail.com');

-- 0013 — Proceso programado cada 10 minutos (vencimientos, recordatorios,
-- conciliación de pagos, tipo de cambio y emails).
--
-- Vercel Hobby solo permite un cron diario, así que el "tick" lo dispara
-- la propia base con pg_cron + pg_net llamando a /api/cron/tick con el
-- secreto CRON_SECRET (guardado en Supabase Vault, no en una tabla).
--
-- Aditiva y reversible (ver ROLLBACK al final). No toca datos.
--
-- Después de aplicarla, UNA VEZ, en el SQL Editor (como postgres):
--   select public.programar_tick('https://<dominio>/api/cron/tick', '<CRON_SECRET>');
-- Para cambiar la URL o el secreto, se vuelve a ejecutar igual.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.programar_tick(p_url text, p_secret text)
returns void
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_id uuid;
begin
  if coalesce(p_url, '') !~ '^https://' or coalesce(length(p_secret), 0) < 16 then
    raise exception 'URL https y secreto de al menos 16 caracteres';
  end if;

  select id into v_id from vault.secrets where name = 'viafactoring_cron_secret';
  if found then
    perform vault.update_secret(v_id, p_secret);
  else
    perform vault.create_secret(p_secret, 'viafactoring_cron_secret', 'Secreto de /api/cron/tick');
  end if;

  if exists (select 1 from cron.job where jobname = 'viafactoring-tick') then
    perform cron.unschedule('viafactoring-tick');
  end if;

  perform cron.schedule(
    'viafactoring-tick',
    '*/10 * * * *',
    format($cmd$
      select net.http_get(
        url := %L,
        headers := jsonb_build_object(
          'Authorization',
          'Bearer ' || (select decrypted_secret from vault.decrypted_secrets
                        where name = 'viafactoring_cron_secret' limit 1)
        ),
        timeout_milliseconds := 55000
      );
    $cmd$, p_url)
  );
end;
$$;

revoke execute on function public.programar_tick(text, text) from public, anon, authenticated;

-- =========================================================================
-- ROLLBACK
-- =========================================================================
-- select cron.unschedule('viafactoring-tick');
-- delete from vault.secrets where name = 'viafactoring_cron_secret';
-- drop function if exists public.programar_tick(text, text);
-- (las extensiones pg_cron / pg_net pueden quedar instaladas)

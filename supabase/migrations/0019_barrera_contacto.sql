-- 0019 · Barrera anti-contacto (como Fiverr)
--
-- Antes de que el fondeador pague la comisión (nivel < 4), nadie puede
-- pasarse teléfono, WhatsApp, email, links ni usuarios de redes por el chat
-- ni en el mensaje de una oferta:
--   * los datos se tapan ANTES de guardarse (trigger: no se puede saltear
--     llamando a la API directo);
--   * si no se pueden separar del texto, se oculta el mensaje entero;
--   * un número partido en varios mensajes seguidos también se tapa;
--   * el texto original queda solo en audit_logs (lo ve el admin);
--   * al tercer intento del mismo usuario en una negociación se abre una
--     excepción para el admin.
-- La IA (desde el servidor) cubre los intentos disfrazados que no siguen
-- ningún patrón: ver ocultar_mensaje_ia().

-- 1. Detector más amplio ---------------------------------------------------

create or replace function public.detectar_contacto(p_texto text)
returns text[]
language plpgsql
immutable
as $$
declare
  t text;
  d text;
  d2 text;
  r text[] := '{}';
begin
  if p_texto is null or length(trim(p_texto)) = 0 then
    return r;
  end if;

  t := lower(p_texto);

  -- Números escritos en palabras ("cero nueve ocho uno...")
  t := regexp_replace(t, '\mcero\M', '0', 'g');
  t := regexp_replace(t, '\muno\M', '1', 'g');
  t := regexp_replace(t, '\mdos\M', '2', 'g');
  t := regexp_replace(t, '\mtres\M', '3', 'g');
  t := regexp_replace(t, '\mcuatro\M', '4', 'g');
  t := regexp_replace(t, '\mcinco\M', '5', 'g');
  t := regexp_replace(t, '\mseis\M', '6', 'g');
  t := regexp_replace(t, '\msiete\M', '7', 'g');
  t := regexp_replace(t, '\mocho\M', '8', 'g');
  t := regexp_replace(t, '\mnueve\M', '9', 'g');

  -- Colapsa separadores entre dígitos: "0981 111-111" → "0981111111".
  d := regexp_replace(t, '(\d)[\s.()/-]+(?=\d)', '\1', 'g');
  -- Sin puntos (los montos en guaraníes usan puntos): "981 123 456".
  d2 := regexp_replace(t, '(\d)[\s()/-]+(?=\d)', '\1', 'g');

  if d ~ '(\+?5959[5-9]\d{7}\M|\m09[5-9]\d{7}\M|\m021\d{6,7}\M|\+\d{9,15})'
     or d2 ~ '\m9[5-9]\d{7}\M' then
    r := array_append(r, 'telefono');
  end if;

  if t ~ '(\m(whatsapp|whatsap|watsap|wasap|guasap|wsp|wpp|whats|wapp)\M|wa\.me)' then
    r := array_append(r, 'whatsapp');
  end if;

  if t ~ '(\m(telegram|telegran)\M|t\.me/)' then
    r := array_append(r, 'telegram');
  end if;

  if t ~ '[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}'
     or t ~ '\marroba\M'
     or t ~ '\m(gmail|hotmail|outlook|yahoo|icloud)\M' then
    r := array_append(r, 'email');
  end if;

  if t ~ '(https?://|www\.|\m[a-z0-9-]+\.(com|net|org|io|app|py)\M)' then
    r := array_append(r, 'url');
  end if;

  if t ~ '(^|\s)@[a-z0-9_.]{3,}' then
    r := array_append(r, 'usuario');
  end if;

  if t ~ '\m(instagram|insta|facebook|linkedin|tiktok|signal|skype|messenger)\M' then
    r := array_append(r, 'redes');
  end if;

  -- Invitaciones a seguir por afuera, aunque no traigan el dato.
  if t ~ '\mmi\s+(cel|celu|celular|tel[eé]fono|correo|mail|contacto|perfil|whats\w*|wsp)\M'
     or t ~ '\mmi\s+n[uú]mero\M(?!\s+de\s+(factura|ruc|orden|timbrado|cdc))'
     or t ~ '\m(llamame|llámame|llamenme|llamame)\M'
     or t ~ '\mescribime\s+(al|a\s+mi|por)\M'
     or t ~ '\mpas(ame|a\s+me)\s+tu\s+(cel|celu|celular|n[uú]mero|whats\w*|wsp|correo|mail|contacto)\M'
     or t ~ '\mte\s+paso\s+mi\M'
     or t ~ 'por\s+fuera\s+de'
     or t ~ 'fuera\s+de\s+(la\s+)?(plataforma|viafactoring|app|aplicaci[oó]n)'
     or t ~ '\mpor\s+(privado|interno|afuera)\M'
     or t ~ '\mbusc(ame|anos)\s+(en|como)\M' then
    r := array_append(r, 'invitacion');
  end if;

  return r;
end;
$$;

grant execute on function public.detectar_contacto(text) to authenticated;

-- 2. Tapar los datos dentro del texto -------------------------------------

create or replace function public.tapar_contacto(p_texto text)
returns text
language plpgsql
immutable
as $$
declare
  r text := p_texto;
  m text;
  dig text;
begin
  if r is null then
    return null;
  end if;

  r := regexp_replace(r, '[[:alnum:]._%+-]+@[[:alnum:].-]+\.[[:alpha:]]{2,}', '[email oculto]', 'g');
  r := regexp_replace(r, '\S+\s+arroba\s+\S+(\s+punto\s+\S+)*', '[email oculto]', 'gi');
  r := regexp_replace(r, '(^|\s)@[[:alnum:]_.]{3,}', '\1[usuario oculto]', 'g');
  r := regexp_replace(r, '(https?://\S+|www\.\S+|wa\.me/\S*|t\.me/\S*)', '[enlace oculto]', 'gi');
  r := regexp_replace(r, '\m[[:alnum:]-]+\.(com|net|org|io|app|py)(\.(py|ar|br))?(/\S*)?', '[enlace oculto]', 'gi');
  r := regexp_replace(r,
    '\m(cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\M([^[:alnum:]]+(cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\M){3,}',
    '[número oculto]', 'gi');

  for m in select (regexp_matches(r, '\+?\d[\d\s.()/-]{5,}\d', 'g'))[1] loop
    dig := regexp_replace(m, '[^0-9+]', '', 'g');
    if dig ~ '^(\+?5959[5-9]\d{7}|09[5-9]\d{7}|021\d{6,7}|\+\d{9,15})$'
       or (dig ~ '^9[5-9]\d{7}$' and m !~ '\.') then
      r := replace(r, m, '[número oculto]');
    end if;
  end loop;

  return r;
end;
$$;

create or replace function public.contacto_es_dato(p_patrones text[])
returns boolean
language sql
immutable
as $$
  select coalesce(p_patrones && array['telefono', 'email', 'url', 'usuario'], false);
$$;

-- 3. Excepción para quien insiste -------------------------------------------

alter table public.exceptions drop constraint if exists exceptions_tipo_check;
alter table public.exceptions add constraint exceptions_tipo_check check (tipo in (
  'pago_inconsistente', 'webhook_invalido', 'orden_desconocida', 'pago_sin_aviso',
  'pago_duplicado', 'sin_tipo_cambio', 'reclamo', 'error_tecnico', 'posible_cierre_externo',
  'intento_contacto'));

-- Registra el intento (original solo en audit_logs) y, al tercero, avisa al admin.
create or replace function public.registrar_intento_contacto(
  p_message_id uuid,
  p_reveal_id uuid,
  p_autor_id uuid,
  p_original text,
  p_patrones text[],
  p_origen text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room public.reveals;
  v_intentos int;
  v_quien text;
begin
  select * into v_room from public.reveals where id = p_reveal_id;
  perform public.log_event('contacto_bloqueado', v_room.invoice_id, p_reveal_id, 'message', p_message_id,
    jsonb_build_object('original', left(p_original, 2000), 'patrones', p_patrones, 'origen', p_origen),
    p_autor_id);

  select count(*) into v_intentos from public.audit_logs
    where accion = 'contacto_bloqueado' and reveal_id = p_reveal_id and actor_id = p_autor_id;

  if v_intentos = 3 then
    select coalesce(nullif(p.empresa, ''), p.nombre) into v_quien from public.profiles p where p.id = p_autor_id;
    perform public.abrir_excepcion(
      'intento_contacto',
      coalesce(v_quien, 'Un usuario') || ' intentó 3 veces compartir datos de contacto antes de la comisión.',
      p_reveal_id, v_room.invoice_id, null, null, p_autor_id,
      jsonb_build_object('intentos', v_intentos));
  end if;
end;
$$;

revoke execute on function public.registrar_intento_contacto(uuid, uuid, uuid, text, text[], text)
  from public, anon, authenticated;

-- 4. Barrera en los mensajes del chat --------------------------------------

create or replace function public.messages_barrera_contacto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pat text[];
  v_prev text;
  v_tapado text;
  v_dig text;
  v_original text := new.cuerpo;
begin
  if new.autor_rol not in ('fondeador', 'operador') then
    return new;
  end if;
  if public.nivel_deal_room(new.reveal_id) >= 4 then
    return new;
  end if;

  v_pat := public.detectar_contacto(new.cuerpo);

  -- Número partido en varios mensajes seguidos del mismo autor: se juntan
  -- los dígitos de los mensajes cortos (los montos completos no cuentan).
  v_dig := regexp_replace(new.cuerpo, '\D', '', 'g');
  if not ('telefono' = any (v_pat)) and length(v_dig) between 1 and 7 then
    select string_agg(dg, '' order by created_at) into v_prev from (
      select regexp_replace(cuerpo, '\D', '', 'g') as dg, created_at from public.messages
      where reveal_id = new.reveal_id and autor_id = new.autor_id
        and created_at > now() - interval '15 minutes'
      order by created_at desc limit 3
    ) x where length(dg) between 1 and 7;
    if (coalesce(v_prev, '') || v_dig) ~ '(09[5-9]\d{7}|5959[5-9]\d{7}|021\d{6,7}|9[5-9]\d{7})' then
      v_pat := array_append(v_pat, 'telefono');
      new.cuerpo := regexp_replace(new.cuerpo, '\d', '•', 'g');
      -- También se tapan los pedazos anteriores.
      update public.messages
        set cuerpo = regexp_replace(cuerpo, '\d', '•', 'g'),
            meta = meta || jsonb_build_object('contacto_oculto', true)
        where id in (
          select id from public.messages
          where reveal_id = new.reveal_id and autor_id = new.autor_id
            and created_at > now() - interval '15 minutes'
          order by created_at desc limit 3);
    end if;
  end if;

  -- «Mi celu es 0981 22…»: invitación con dígitos → se tapan los dígitos.
  if 'invitacion' = any (v_pat) and length(v_dig) >= 3 then
    new.cuerpo := regexp_replace(new.cuerpo, '\d', '•', 'g');
    v_pat := array_append(v_pat, 'telefono');
  end if;

  -- Un mensaje que es solo un pedacito de número (3 a 7 dígitos, sin
  -- letras) se tapa por las dudas: no sirve para negociar y es la forma de
  -- pasar un teléfono de a partes.
  if cardinality(v_pat) = 0 and new.cuerpo !~ '[[:alpha:]]'
     and length(regexp_replace(new.cuerpo, '\D', '', 'g')) between 3 and 7 then
    new.cuerpo := regexp_replace(new.cuerpo, '\d', '•', 'g');
    new.meta := coalesce(new.meta, '{}'::jsonb) || jsonb_build_object('contacto_oculto', true);
    return new;
  end if;

  if cardinality(v_pat) = 0 then
    return new;
  end if;

  new.contacto_detectado := true;
  new.patrones := v_pat;

  if public.contacto_es_dato(v_pat) then
    v_tapado := public.tapar_contacto(new.cuerpo);
    if public.contacto_es_dato(public.detectar_contacto(v_tapado)) then
      v_tapado := '🔒 Mensaje oculto: tenía datos de contacto. Se comparten automáticamente al cerrar el trato.';
    end if;
    new.cuerpo := v_tapado;
    new.meta := coalesce(new.meta, '{}'::jsonb) || jsonb_build_object('contacto_oculto', true);
    perform public.registrar_intento_contacto(new.id, new.reveal_id, new.autor_id, v_original, v_pat, 'patron');
  else
    -- Solo la intención ("escribime por WhatsApp"): se muestra con un aviso.
    new.meta := coalesce(new.meta, '{}'::jsonb) || jsonb_build_object('aviso_contacto', true);
  end if;

  return new;
end;
$$;

revoke execute on function public.messages_barrera_contacto() from public, anon, authenticated;

drop trigger if exists messages_barrera_contacto_trg on public.messages;
create trigger messages_barrera_contacto_trg
  before insert on public.messages
  for each row execute function public.messages_barrera_contacto();

-- 5. Barrera en el mensaje de una oferta ----------------------------------

create or replace function public.offers_barrera_contacto()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pat text[];
  v_tapado text;
  v_autor uuid;
begin
  if new.mensaje is null or new.reveal_id is null or public.nivel_deal_room(new.reveal_id) >= 4 then
    return new;
  end if;
  v_pat := public.detectar_contacto(new.mensaje);
  if not public.contacto_es_dato(v_pat) then
    return new;
  end if;
  v_tapado := public.tapar_contacto(new.mensaje);
  if public.contacto_es_dato(public.detectar_contacto(v_tapado)) then
    v_tapado := '🔒 Mensaje oculto: tenía datos de contacto.';
  end if;
  v_autor := case when new.autor_rol = 'fondeador' then new.fondeador_id
                  else (select operador_id from public.invoices where id = new.invoice_id) end;
  perform public.registrar_intento_contacto(null, new.reveal_id, v_autor, new.mensaje, v_pat, 'oferta');
  new.mensaje := v_tapado;
  return new;
end;
$$;

revoke execute on function public.offers_barrera_contacto() from public, anon, authenticated;

drop trigger if exists offers_barrera_contacto_trg on public.offers;
create trigger offers_barrera_contacto_trg
  before insert on public.offers
  for each row execute function public.offers_barrera_contacto();

-- 6. La IA del servidor marca un intento disfrazado ------------------------
-- El servidor manda el mensaje ya reemplazado por el aviso y después llama a
-- esto (service role) para dejar registrado el original y sumar el intento.

create or replace function public.registrar_intento_ia(p_message_id uuid, p_original text, p_razon text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_msg public.messages;
begin
  if not public.es_service_role() then
    raise exception 'No autorizado';
  end if;
  select * into v_msg from public.messages where id = p_message_id;
  if not found then
    return;
  end if;
  update public.messages
    set contacto_detectado = true,
        patrones = array_append(patrones, 'ia'),
        meta = meta || jsonb_build_object('contacto_oculto', true, 'razon_ia', left(coalesce(p_razon, ''), 300))
    where id = p_message_id;
  perform public.registrar_intento_contacto(p_message_id, v_msg.reveal_id, v_msg.autor_id, p_original, array['ia'], 'ia');
end;
$$;

revoke execute on function public.registrar_intento_ia(uuid, text, text) from public, anon, authenticated;
grant execute on function public.registrar_intento_ia(uuid, text, text) to service_role;

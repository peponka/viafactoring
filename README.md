# ViaFactoring

Marketplace de factoring de fletes fluviales y de camiones en la hidrovía
Paraguay-Paraná. Conecta operadores de flete (que necesitan cobrar antes)
con fondeadores — financieras, bancos, fondos, inversores — que quieren
financiar esas facturas.

- El **operador** carga sus facturas pendientes de cobro. Es gratis, siempre.
- El **fondeador** navega la cartera gratis viendo solo rangos (monto,
  plazo, riesgo, rubro). Gasta **1 crédito** para destrabar el detalle
  completo de una factura: deudor, contacto del operador y el documento
  escaneado.
- Los créditos se compran en packs. Hoy el pago se confirma a mano (vos le
  pasás un link de pago externo al fondeador y confirmás cuando te llega la
  plata); el sistema ya está armado para que ese paso se automatice más
  adelante con un webhook de MercadoPago/Stripe sin tocar el resto.

Este proyecto reemplaza los dos Artifacts de Claude (`ViaFactoring` y
`ViaFactoring — Interno`) por una aplicación real: self-serve, con cuentas
propias para operadores y fondeadores, sin que vos tengas que operar cada
paso a mano.

## Stack

Next.js 16 (App Router) + TypeScript + Tailwind CSS 4 + Supabase
(Postgres, Auth, Storage). Pensado para deployar en Vercel.

## 1. Crear el proyecto en Supabase

1. Andá a [supabase.com](https://supabase.com/dashboard) y creá un proyecto
   nuevo (elegí una región cerca de Paraguay, ej. São Paulo).
2. En **SQL Editor**, pegá y ejecutá todo el contenido de
   `supabase/migrations/0001_init.sql`. Esto crea las tablas, las funciones,
   los triggers, las políticas de RLS y el bucket de Storage `facturas`.
3. En **Authentication → Providers**, dejá **Email** habilitado. Mientras
   estás probando, en **Authentication → Sign In / Providers → Email**
   podés desactivar "Confirm email" para no tener que confirmar cada cuenta
   de prueba manualmente (en producción normalmente lo querés activado).
4. En **Project Settings → API** vas a encontrar la `Project URL`, la
   `anon public key` y la `service_role key` que necesitás para el paso 3.

## 2. Variables de entorno

```bash
cp .env.example .env.local
```

Completá `.env.local` con los tres valores del paso anterior. La
`SUPABASE_SERVICE_ROLE_KEY` nunca se expone al cliente — solo se usa
server-side (en `src/lib/supabase/server.ts`) para generar signed URLs de
los documentos de factura cuando un fondeador ya pagó por verlos.

## 3. Correr en local

```bash
npm install
npm run dev
```

Abrí [http://localhost:3000](http://localhost:3000).

## 4. Convertirte en admin

No hay alta de admin por signup (por seguridad). Registrate una vez como
operador o fondeador (da igual cuál) y después, en el SQL Editor de
Supabase, corré:

```sql
update public.profiles set role = 'admin' where id = 'TU-USER-ID';
```

Tu `id` lo ves en **Authentication → Users** en el dashboard de Supabase, o
corriendo `select id, email from auth.users;`. Con `role = 'admin'` entrás a
`/admin` con el panel de pagos, fondeadores, facturas, packs de crédito y
matches.

## 5. Deploy en Vercel

1. Subí este repo a GitHub (`git remote add origin ...` y `git push`).
2. Importalo en [vercel.com/new](https://vercel.com/new).
3. Cargá las mismas tres variables de entorno del `.env.local` en el
   proyecto de Vercel (Production, Preview y Development).
4. Deploy. Cada push a `main` redeploya automáticamente.

## Cómo está armado el modelo de créditos

- `invoice_teasers` es una vista de Postgres que le muestra a cualquier
  fondeador autenticado **solo rangos** (`monto_banda`, `plazo_banda`,
  `riesgo`, `rubro`) — nunca el monto exacto, el deudor ni el operador. La
  tabla `invoices` en sí tiene RLS que bloquea a los fondeadores de leerla
  directo.
- Cuando un fondeador quiere ver el detalle completo, el cliente llama a la
  función `reveal_invoice(invoice_id)` (RPC de Postgres, `SECURITY
  DEFINER`). Esa función, de forma atómica: chequea que tenga al menos 1
  crédito, descuenta 1, deja registro en `credit_transactions` y en
  `reveals`, y devuelve la fila completa de `invoices`. Si ya la había
  revelado antes, es idempotente — no vuelve a cobrar.
- El documento escaneado de la factura vive en un bucket privado de Storage
  (`facturas`). Un fondeador nunca accede al bucket directo: solo recibe
  una *signed URL* de 10 minutos, generada server-side (`getDocumentoUrlAction`
  en `src/app/fondeador/actions.ts`) y solo después de confirmar que existe
  un `reveal` real para esa factura y ese fondeador.

## Cómo se compran créditos hoy (manual) y cómo automatizarlo después

Hoy: el fondeador pide un pack desde `/fondeador/creditos` → se crea un
`payment_requests` en estado `pendiente` → vos (admin) le pasás un link de
pago externo (MercadoPago, transferencia, lo que sea) desde
`/admin/pagos` → cuando confirmás que llegó la plata, apretás "Confirmar
pago y acreditar", que llama a la función `confirm_payment_request()` y
acredita los créditos del pack de forma atómica.

Para automatizarlo con MercadoPago o Stripe más adelante, no hace falta
tocar el modelo de datos: armás un *route handler* (`src/app/api/webhooks/
mercadopago/route.ts`, por ejemplo) que reciba la notificación de pago
confirmado, y ahí adentro llamás a la misma función `confirm_payment_request`
usando el cliente de service role (`createServiceRoleClient()` en
`src/lib/supabase/server.ts`) pasándole el `external_reference` que le
hayas puesto al pago al crearlo. El campo `metodo` y `external_reference`
en `payment_requests` ya están pensados para esto.

## Estructura

```
src/
  app/
    (auth)/            login, signup, y las server actions de auth
    auth/confirmar/     pantalla de "confirmá tu email"
    operador/           layout + páginas del rol operador (cargar/ver facturas)
    fondeador/           layout + páginas del rol fondeador (marketplace, créditos)
    admin/               layout + páginas del rol admin (pagos, fondeadores, facturas, packs, matches)
  components/           UI compartida (botones, cards, nav)
  lib/
    supabase/            clientes de Supabase (browser, server, proxy/middleware)
    database.types.ts    tipos a mano — reemplazar con `supabase gen types` cuando el proyecto esté vivo
    session.ts            helper para leer el usuario + perfil actual
    format.ts             formateo de moneda/fecha/labels
supabase/
  migrations/0001_init.sql  todo el schema: tablas, RLS, funciones, triggers, storage
```

## Qué falta / roadmap

- **Pagos automáticos** (MercadoPago/Stripe) — ver sección de arriba. Es lo
  más grande que falta para que sea 100% self-serve sin que vos confirmes
  pagos a mano.
- **OCR de la factura al cargarla** — en los Artifacts existentes esto se
  resolvía con la visión de Claude. Acá se puede sumar con la API de
  Anthropic (subís la foto, mandás la imagen a Claude, te devuelve los
  campos en JSON para precargar el formulario) — no está implementado
  todavía, el operador carga los datos a mano.
- **Notificaciones** — hoy nadie recibe un email/WhatsApp cuando hay un
  match o un pago pendiente; hay que revisar el panel a mano.
- **Edición de facturas ya cargadas** — hoy solo se pueden retirar, no
  editar.
- La landing pública que ya tenías como Artifact sigue viva en
  `https://claude.ai/artifact/32MMQd34Hu8AacddG5bUw6` y en
  `viafactoring.netlify.app` — podés seguir usándola para juntar leads
  mientras señalás a la gente hacia `/signup` de esta app, o reemplazarla
  del todo con la página de inicio de acá (`src/app/page.tsx`).

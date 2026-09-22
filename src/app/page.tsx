import Link from "next/link";
import { getUserAndProfile, homeForRole } from "@/lib/session";
import { redirect } from "next/navigation";
import { LinkButton } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

const CONTACTO_EMAIL = "contacto@viafactoring.com.py";

export default async function HomePage({ searchParams }: PageProps<"/">) {
  // Supabase redirige acá (con ?code=...) después de que alguien confirma
  // su email. Si viene ese código, lo canjeamos por una sesión antes de
  // seguir, así la confirmación de cuenta queda completa.
  const { code } = await searchParams;
  let justConfirmed = false;
  if (typeof code === "string") {
    const supabase = await createClient();
    await supabase.auth.exchangeCodeForSession(code);
    justConfirmed = true;
  }

  // Solo mandamos al panel automáticamente justo después de confirmar el
  // email (ahí sí tiene sentido saltar la landing). El resto de las veces
  // dejamos ver la página principal aunque ya esté logueado — si no, el
  // logo "ViaFactoring" queda roto en la práctica: lo tocás y te devuelve
  // al mismo panel en el que ya estabas, como si no hubiera pasado nada.
  if (justConfirmed) {
    const { user, profile } = await getUserAndProfile();
    if (user && profile) {
      redirect(homeForRole(profile.role));
    }
  }

  return (
    <main className="flex-1">
      <div className="wrap max-w-5xl mx-auto px-6">
        <nav className="flex items-center justify-between py-6 gap-4 flex-wrap">
          <div className="flex items-center gap-2.5 font-serif font-semibold text-xl">
            <span className="w-8 h-8 rounded-lg bg-accent text-accent-ink flex items-center justify-center font-mono text-sm">
              Vf
            </span>
            ViaFactoring
          </div>
          <div className="flex items-center gap-5 flex-wrap">
            <a
              href="#contacto"
              className="text-sm font-semibold text-ink-soft hover:text-ink"
            >
              Contacto
            </a>
            <Link
              href="/login"
              className="text-sm font-semibold text-ink-soft hover:text-ink"
            >
              Iniciar sesión
            </Link>
            <LinkButton href="/signup" className="px-4 py-2 text-sm">
              Registrarme
            </LinkButton>
          </div>
        </nav>

        <section className="py-16 md:py-24 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <p className="uppercase tracking-widest text-[.72rem] font-semibold text-accent mb-3">
              Factoring de facturas · Paraguay
            </p>
            <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
              Cobrá tu factura cuando la emitís, no 60 días después
            </h1>
            <p className="text-ink-soft text-lg mt-5 max-w-[48ch]">
              ViaFactoring conecta a quienes tienen facturas por cobrar con
              financieras, bancos, fondos e inversores dispuestos a
              adelantarles ese cobro.
            </p>
            <div className="flex gap-3 mt-8 flex-wrap">
              <LinkButton href="/signup">Sumar mi factura o mi capital</LinkButton>
              <LinkButton href="/login" variant="ghost">
                Ya tengo cuenta
              </LinkButton>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="bg-surface border border-line rounded-2xl p-6">
              <p className="font-serif font-semibold text-lg mb-1">
                Para quien tiene facturas por cobrar
              </p>
              <p className="text-ink-soft text-sm">
                Cargás tus facturas pendientes, sin costo ni compromiso.
                Nunca pagás nada.
              </p>
            </div>
            <div className="bg-surface border border-line rounded-2xl p-6">
              <p className="font-serif font-semibold text-lg mb-1">
                Para fondeadores
              </p>
              <p className="text-ink-soft text-sm">
                Navegás la cartera gratis, viendo el monto y el vencimiento
                exactos de cada operación. Pagás una tarifa de desbloqueo
                solo por la factura que te interese, para ver el deudor, el
                contacto y la documentación.
              </p>
            </div>
          </div>
        </section>

        {/* Qué es el factoring */}
        <section className="py-14 border-t border-line">
          <div className="grid md:grid-cols-2 gap-10 items-start">
            <div>
              <p className="uppercase tracking-widest text-[.72rem] font-semibold text-accent mb-3">
                Factoring, en criollo
              </p>
              <h2 className="text-2xl md:text-3xl font-semibold mb-4">
                ¿Qué es el factoring?
              </h2>
              <p className="text-ink-soft text-base">
                Es vender una factura que todavía no cobraste a alguien
                dispuesto a adelantarte ese dinero, a cambio de una
                comisión. En vez de esperar 30, 60 o 90 días a que tu
                cliente te pague, cobrás ahora — y quien te adelantó el
                dinero cobra directamente cuando la factura vence.
              </p>
              <p className="text-ink-soft text-base mt-4">
                No es un préstamo: no pedís plata prestada ni te endeudás.
                Vendés un activo que ya es tuyo — tu factura — y listo.
              </p>
            </div>
            <div className="grid gap-3">
              {[
                {
                  t: "Liquidez inmediata",
                  d: "Convertís una factura pendiente en dinero en tu cuenta en días, no en meses.",
                },
                {
                  t: "No suma deuda",
                  d: "Al no ser un préstamo, no afecta tu capacidad de endeudamiento ni pide garantías.",
                },
                {
                  t: "Sin trámites bancarios",
                  d: "No hace falta historial extenso ni papeleo de banco — cargás la factura y listo.",
                },
                {
                  t: "Vos elegís qué factura vender",
                  d: "Sin compromiso a largo plazo: factura por factura, cuándo y cuál te conviene.",
                },
              ].map((v) => (
                <div
                  key={v.t}
                  className="bg-surface border border-line rounded-2xl p-5"
                >
                  <p className="font-semibold text-sm mb-1">{v.t}</p>
                  <p className="text-ink-soft text-sm">{v.d}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Cómo funciona */}
        <section className="py-14 border-t border-line">
          <p className="uppercase tracking-widest text-[.72rem] font-semibold text-accent mb-3 text-center">
            Cómo funciona
          </p>
          <h2 className="text-2xl md:text-3xl font-semibold text-center mb-10">
            Dos caminos, un mismo lugar
          </h2>

          <div className="grid md:grid-cols-2 gap-8">
            <div>
              <p className="font-serif font-semibold text-lg mb-4">
                Si tenés facturas por cobrar
              </p>
              <ol className="flex flex-col gap-4">
                {[
                  "Cargás tu factura pendiente — es gratis, siempre.",
                  "Los fondeadores ven el monto y el vencimiento exactos, sin saber todavía quién sos.",
                  "Cuando uno paga la tarifa de desbloqueo, accede a tu contacto y te escribe.",
                  "Acordás el adelanto directo con él y marcás la factura como cerrada.",
                ].map((paso, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="num shrink-0 w-8 h-8 rounded-full bg-accent text-accent-ink flex items-center justify-center text-sm font-bold shadow-sm">
                      {i + 1}
                    </span>
                    <span className="text-ink-soft text-sm pt-0.5">{paso}</span>
                  </li>
                ))}
              </ol>
            </div>

            <div>
              <p className="font-serif font-semibold text-lg mb-4">
                Si tenés capital para adelantar
              </p>
              <ol className="flex flex-col gap-4">
                {[
                  "Navegás la cartera de facturas disponibles, gratis y sin registrarte para mirar.",
                  "Elegís la que te interesa y pagás la tarifa de desbloqueo según su monto.",
                  "Confirmamos el pago y te habilitamos el deudor, el contacto del operador y la documentación.",
                  "Lo contactás directo y acuerdan la operación entre ustedes.",
                ].map((paso, i) => (
                  <li key={i} className="flex gap-3">
                    <span className="num shrink-0 w-8 h-8 rounded-full bg-accent text-accent-ink flex items-center justify-center text-sm font-bold shadow-sm">
                      {i + 1}
                    </span>
                    <span className="text-ink-soft text-sm pt-0.5">{paso}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </section>

        {/* Confianza / seguridad */}
        <section className="py-14 border-t border-line bg-surface-2 -mx-6 px-6 md:rounded-3xl">
          <div className="grid md:grid-cols-2 gap-8 items-start">
            <div>
              <p className="uppercase tracking-widest text-[.72rem] font-semibold text-accent mb-3">
                Cómo cuidamos los datos
              </p>
              <h2 className="text-2xl md:text-3xl font-semibold mb-4">
                Nada se expone antes de tiempo
              </h2>
              <p className="text-ink-soft text-sm max-w-[52ch]">
                El deudor, el contacto del operador y la documentación de
                cada factura quedan ocultos hasta que confirmamos el pago de
                la tarifa de desbloqueo. Recién ahí se habilitan, y solo
                para quien pagó.
              </p>
            </div>
            <div className="grid gap-3">
              <div className="bg-surface border border-line rounded-2xl p-5">
                <p className="font-semibold text-sm mb-1">
                  Confirmación manual de cada pago
                </p>
                <p className="text-ink-soft text-sm">
                  Cada tarifa de desbloqueo la confirmamos a mano antes de
                  dar acceso, para evitar errores o accesos indebidos.
                </p>
              </div>
              <div className="bg-surface border border-line rounded-2xl p-5">
                <p className="font-semibold text-sm mb-1">
                  Cero intermediación forzosa
                </p>
                <p className="text-ink-soft text-sm">
                  ViaFactoring conecta a las partes. El acuerdo de adelanto
                  lo cierran directamente el operador y el fondeador, en
                  los términos que negocien entre ellos.
                </p>
              </div>
              <div className="bg-surface border border-line rounded-2xl p-5">
                <p className="font-semibold text-sm mb-1">
                  Etapa piloto en Paraguay
                </p>
                <p className="text-ink-soft text-sm">
                  Estamos arrancando en el mercado paraguayo.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Quiénes somos */}
        <section className="py-14 border-t border-line">
          <div className="max-w-[68ch] mx-auto text-center">
            <p className="uppercase tracking-widest text-[.72rem] font-semibold text-accent mb-3">
              Quiénes somos
            </p>
            <h2 className="text-2xl md:text-3xl font-semibold mb-5">
              Un problema concreto de capital de trabajo
            </h2>
            <p className="text-ink-soft text-base">
              Muchas empresas y proveedores cobran sus facturas 30, 60 o
              hasta 90 días después de emitirlas, mientras sus costos son
              inmediatos. ViaFactoring los conecta con financieras, bancos,
              fondos e inversores dispuestos a adelantarles ese cobro,
              evaluando cada operación por su cuenta. Estamos en etapa
              piloto, arrancando por el mercado paraguayo.
            </p>
          </div>
        </section>

        {/* FAQ */}
        <section className="py-14 border-t border-line bg-surface-2 -mx-6 px-6 md:rounded-3xl">
          <p className="uppercase tracking-widest text-[.72rem] font-semibold text-accent mb-3 text-center">
            Preguntas frecuentes
          </p>
          <h2 className="text-2xl md:text-3xl font-semibold text-center mb-10">
            Lo que más preguntan
          </h2>
          <div className="grid gap-4 max-w-[64ch] mx-auto">
            {[
              {
                q: "¿Cuánto cuesta cargar una factura?",
                a: "Nada. Cargar y publicar tus facturas es siempre gratis para el operador.",
              },
              {
                q: "¿Cuánto paga un fondeador?",
                a: "Una tarifa de desbloqueo que depende del monto de la factura. Se ve antes de pagar, sin costos ocultos.",
              },
              {
                q: "¿Cómo se paga hoy?",
                a: "Por transferencia bancaria. Confirmamos el pago manualmente y ahí habilitamos el acceso. Estamos trabajando en sumar pagos automáticos.",
              },
              {
                q: "¿ViaFactoring participa en la negociación del adelanto?",
                a: "No. Conectamos a las partes; el acuerdo lo cierran directamente el operador y el fondeador.",
              },
              {
                q: "¿Qué pasa si nadie desbloquea mi factura?",
                a: "Podés retirarla cuando quieras. No hay compromiso ni costo por publicarla.",
              },
            ].map((item) => (
              <div
                key={item.q}
                className="bg-surface border border-line rounded-2xl p-5"
              >
                <p className="font-semibold text-sm mb-1.5">{item.q}</p>
                <p className="text-ink-soft text-sm">{item.a}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Contacto */}
        <section id="contacto" className="py-14 border-t border-line">
          <div className="bg-surface border border-line rounded-2xl p-8 md:p-10 text-center max-w-[52ch] mx-auto">
            <p className="font-serif font-semibold text-xl mb-2">
              ¿Tenés dudas antes de sumarte?
            </p>
            <p className="text-ink-soft text-sm mb-6">
              Escribinos y te respondemos directamente.
            </p>
            <LinkButton href={`mailto:${CONTACTO_EMAIL}`} variant="ghost">
              {CONTACTO_EMAIL}
            </LinkButton>
          </div>
        </section>
      </div>

      <footer className="border-t border-line py-7 mt-8">
        <div className="wrap max-w-5xl mx-auto px-6 text-sm text-ink-soft flex justify-between flex-wrap gap-3">
          <span>ViaFactoring — factoring de facturas en Paraguay</span>
          <div className="flex items-center gap-4 flex-wrap">
            <Link href="/terminos" className="hover:text-ink">
              Términos
            </Link>
            <Link href="/privacidad" className="hover:text-ink">
              Privacidad
            </Link>
            <span>Un proyecto en etapa piloto</span>
          </div>
        </div>
      </footer>
    </main>
  );
}

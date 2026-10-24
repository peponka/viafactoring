import Link from "next/link";
import { getUserAndProfile, homeForRole } from "@/lib/session";
import { redirect } from "next/navigation";
import { LinkButton, Logo } from "@/components/ui";
import { createClient } from "@/lib/supabase/server";

const CONTACTO_EMAIL = "contacto@viafactoring.com.py";

function Check({ className = "" }: { className?: string }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

/** Mockup del feed del fondeador, dibujado con HTML para el hero. */
function HeroMock() {
  return (
    <div className="relative mx-auto w-full max-w-[360px]" aria-hidden="true">
      <div className="absolute inset-x-6 top-5 -bottom-4 rounded-[28px] bg-surface-3" />
      <div className="absolute inset-x-3 top-2.5 -bottom-2 rounded-[28px] bg-[#f0eee7] border border-line" />
      <div className="relative bg-surface border border-line rounded-[28px] shadow-[var(--shadow-lift)] p-5 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            <span className="text-[11px] font-semibold bg-slate-soft text-slate-ink px-2.5 py-1 rounded-full">Transporte</span>
            <span className="text-[11px] font-semibold bg-slate-soft text-slate-ink px-2.5 py-1 rounded-full">Empresa privada</span>
          </div>
          <span className="text-[11px] text-ink-soft">hace 2 h</span>
        </div>
        <div>
          <p className="text-xs text-ink-soft">Monto de la factura</p>
          <p className="num text-[2rem] font-semibold leading-tight">USD 18.400</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="bg-surface-2 rounded-xl px-3 py-2.5">
            <p className="text-[11px] text-ink-soft">Plazo</p>
            <p className="text-sm font-semibold">79 días</p>
          </div>
          <div className="bg-surface-2 rounded-xl px-3 py-2.5">
            <p className="text-[11px] text-ink-soft">Riesgo</p>
            <p className="text-sm font-bold text-good">Bajo</p>
          </div>
        </div>
        <div className="rounded-2xl bg-ink text-white p-4 flex flex-col gap-2">
          <p className="text-[11px] font-bold tracking-[0.12em] text-[#9fd8c0]">FICHA DE VERIFICACIÓN · IA</p>
          {[
            "Código de control (CDC) válido",
            "RUC coincide con quien la sube",
            "Sin facturas duplicadas",
          ].map((t) => (
            <p key={t} className="flex items-center gap-2 text-[13px]">
              <span className="w-5 h-5 rounded-md bg-accent flex items-center justify-center shrink-0">
                <Check className="w-3 h-3" />
              </span>
              {t}
            </p>
          ))}
        </div>
        <div className="flex items-center justify-center gap-6 pt-1">
          <span className="w-13 h-13 rounded-full border border-line bg-surface flex items-center justify-center text-ink-soft">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </span>
          <span className="w-15 h-15 rounded-full bg-accent text-white flex items-center justify-center shadow-[0_8px_20px_rgb(11_110_79_/_0.32)]">
            <Check className="w-6 h-6" />
          </span>
        </div>
      </div>
    </div>
  );
}

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
      <header className="sticky top-0 z-40 bg-background/90 backdrop-blur border-b border-line">
        <nav className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          <Link href="/" aria-label="ViaFactoring, inicio">
            <Logo />
          </Link>
          <div className="flex items-center gap-1 sm:gap-2">
            <a href="#como-funciona" className="hidden md:inline text-sm font-semibold text-ink-soft hover:text-ink px-3 py-2">
              Cómo funciona
            </a>
            <a href="#preguntas" className="hidden md:inline text-sm font-semibold text-ink-soft hover:text-ink px-3 py-2">
              Preguntas
            </a>
            <Link href="/login" className="text-sm font-semibold text-ink-soft hover:text-ink px-3 min-h-11 flex items-center">
              Entrar
            </Link>
            <LinkButton href="/signup" className="!min-h-10 !px-4 text-sm">
              Registrarme
            </LinkButton>
          </div>
        </nav>
      </header>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pt-12 pb-16 md:pt-20 md:pb-24 grid md:grid-cols-[1.1fr_1fr] gap-12 items-center">
        <div className="anim-in">
          <span className="inline-flex items-center gap-2 text-xs font-bold text-accent bg-accent-soft px-3 py-1.5 rounded-full">
            <span className="w-1.5 h-1.5 rounded-full bg-accent" />
            Factoring de facturas · Paraguay
          </span>
          <h1 className="mt-5 text-[2.6rem] leading-[1.05] md:text-[3.6rem] font-bold">
            Cobrá tu factura hoy, no en 60 días.
          </h1>
          <p className="text-ink-soft text-lg mt-5 max-w-[46ch]">
            Conectamos empresas con facturas por cobrar con financieras,
            bancos, fondos e inversores que les adelantan ese cobro. Cada
            factura llega con una ficha de verificación hecha por IA.
          </p>
          <div className="flex gap-3 mt-8 flex-wrap">
            <LinkButton href="/signup">Tengo facturas por cobrar</LinkButton>
            <LinkButton href="/signup" variant="ghost">
              Tengo capital para adelantar
            </LinkButton>
          </div>
          <ul className="mt-8 flex flex-wrap gap-x-6 gap-y-2 text-sm text-ink-soft">
            {["Siempre gratis para pymes", "No tocamos el dinero", "Fondeadores verificados"].map((t) => (
              <li key={t} className="flex items-center gap-2">
                <Check className="text-accent" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <HeroMock />
      </section>

      {/* Dos lados */}
      <section className="bg-surface border-y border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 grid md:grid-cols-2 gap-5">
          <div className="rounded-3xl bg-surface-2 p-7 flex flex-col gap-4">
            <span className="w-12 h-12 rounded-2xl bg-accent-soft text-accent flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" /><path d="M14 3v6h6M9 14h6M9 18h4" /></svg>
            </span>
            <h2 className="text-2xl font-bold">Para pymes con facturas por cobrar</h2>
            <p className="text-ink-soft">
              Sacás una foto a la factura, la IA lee los datos y la publicás.
              Recibís ofertas, las comparás explicadas en simple y elegís.
              Nunca pagás nada.
            </p>
          </div>
          <div className="rounded-3xl bg-ink text-white p-7 flex flex-col gap-4">
            <span className="w-12 h-12 rounded-2xl bg-white/10 text-[#9fd8c0] flex items-center justify-center">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3 21h18M4 10h16M12 3l9 7H3z" /><path d="M6 10v8M10 10v8M14 10v8M18 10v8" /></svg>
            </span>
            <h2 className="text-2xl font-bold text-white">Para fondeadores</h2>
            <p className="text-[#c9d2dd]">
              Inversores individuales e instituciones financieras. Definís tu
              rango de montos y plazos, y deslizás solo las facturas que
              encajan con vos. Pagás una comisión fija únicamente si cerrás.
            </p>
          </div>
        </div>
      </section>

      {/* IA */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-20 grid md:grid-cols-2 gap-10 items-center">
        <div>
          <p className="uppercase tracking-[0.14em] text-[.72rem] font-bold text-accent mb-3">
            Ficha de verificación con IA
          </p>
          <h2 className="text-3xl md:text-4xl font-bold">Hechos verificados, no promesas</h2>
          <p className="text-ink-soft text-lg mt-4 max-w-[48ch]">
            Antes de que hagas una oferta, la IA revisa la factura y junta
            datos públicos de la empresa. Te muestra qué está verificado y
            qué no. La decisión siempre es tuya.
          </p>
        </div>
        <ul className="grid gap-3">
          {[
            ["Lectura automática", "Extrae deudor, monto, vencimiento y el código de control de la factura electrónica."],
            ["Controles de coherencia", "Valida el CDC, que el RUC coincida con quien sube la factura y que no esté repetida."],
            ["Datos públicos de la empresa", "Contratos con el Estado según la DNCP y presencia pública del deudor."],
            ["Ofertas explicadas en simple", "La pyme ve cuánto recibe, cuándo y qué significa cada oferta, sin letra chica."],
          ].map(([t, d]) => (
            <li key={t} className="bg-surface border border-line rounded-2xl p-5 flex gap-4">
              <span className="w-8 h-8 rounded-lg bg-accent-soft text-accent flex items-center justify-center shrink-0">
                <Check />
              </span>
              <div>
                <p className="font-semibold">{t}</p>
                <p className="text-ink-soft text-sm mt-0.5">{d}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Cómo funciona */}
      <section id="como-funciona" className="bg-surface border-y border-line scroll-mt-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-20">
          <h2 className="text-3xl md:text-4xl font-bold text-center">Cómo funciona</h2>
          <div className="mt-10 grid md:grid-cols-2 gap-10">
            {[
              {
                t: "Si tenés facturas por cobrar",
                pasos: [
                  "Subís la factura. La IA completa los datos por vos.",
                  "Le llega a los fondeadores cuyo rango encaja con tu factura.",
                  "Recibís ofertas en un Deal Room y aceptás la que prefieras.",
                  "El fondeador te transfiere el anticipo directo a tu cuenta.",
                ],
              },
              {
                t: "Si tenés capital para adelantar",
                pasos: [
                  "Te registrás como inversor individual o institución.",
                  "Definís montos, plazos, riesgo y rubros que te interesan.",
                  "Deslizás facturas: «Me interesa» te muestra el deudor y la ficha completa.",
                  "Ofertás. Si la pyme acepta, pagás la comisión y se libera el contacto.",
                ],
              },
            ].map((col) => (
              <div key={col.t}>
                <p className="font-display font-semibold text-xl mb-5">{col.t}</p>
                <ol className="flex flex-col gap-4">
                  {col.pasos.map((paso, i) => (
                    <li key={i} className="flex gap-4 items-start">
                      <span className="num shrink-0 w-9 h-9 rounded-full bg-accent text-accent-ink flex items-center justify-center text-sm font-bold">
                        {i + 1}
                      </span>
                      <span className="text-ink-soft pt-1.5">{paso}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Factoring en criollo + seguridad */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-20 grid md:grid-cols-2 gap-10 items-start">
        <div>
          <p className="uppercase tracking-[0.14em] text-[.72rem] font-bold text-accent mb-3">
            Factoring, en criollo
          </p>
          <h2 className="text-3xl font-bold mb-4">No es un préstamo</h2>
          <p className="text-ink-soft">
            Es vender una factura que todavía no cobraste a alguien dispuesto
            a adelantarte ese dinero. En vez de esperar 30, 60 o 90 días a que
            tu cliente te pague, cobrás ahora, y quien te adelantó el dinero
            cobra cuando la factura vence. No te endeudás: vendés un activo
            que ya es tuyo.
          </p>
        </div>
        <div className="grid gap-3">
          {[
            ["El dinero va directo", "ViaFactoring nunca recibe ni mueve el anticipo: el fondeador se lo transfiere directo a la empresa."],
            ["Datos por etapas", "Antes del interés solo se ven datos generales. Teléfonos y emails se liberan al cerrar el trato."],
            ["Documentos con marca de agua", "Cada descarga queda registrada y lleva el nombre de quien la descargó."],
          ].map(([t, d]) => (
            <div key={t} className="bg-surface border border-line rounded-2xl p-5">
              <p className="font-semibold">{t}</p>
              <p className="text-ink-soft text-sm mt-0.5">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="preguntas" className="bg-surface border-y border-line scroll-mt-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 md:py-20">
          <h2 className="text-3xl md:text-4xl font-bold text-center mb-10">Preguntas frecuentes</h2>
          <div className="flex flex-col gap-3">
            {[
              {
                q: "¿Cuánto cuesta para una pyme?",
                a: "Nada. Subir y publicar facturas es siempre gratis.",
              },
              {
                q: "¿Cuánto paga un fondeador?",
                a: "Solo una comisión de cierre fija, que depende del monto de la factura y se ve antes de ofertar. Si no cerrás, no pagás.",
              },
              {
                q: "¿Hay un monto mínimo?",
                a: "Sí: las facturas tienen que ser de al menos USD 3.000 o su equivalente en guaraníes. Además, cada fondeador define su propio rango.",
              },
              {
                q: "¿La IA me dice si conviene una factura?",
                a: "No. La IA verifica datos y los muestra de forma ordenada. Cada fondeador hace su propio análisis y decide.",
              },
              {
                q: "¿ViaFactoring toca el dinero del anticipo?",
                a: "No. ViaFactoring es una plataforma tecnológica que conecta partes: no es entidad financiera, no capta ni administra fondos y no es parte del acuerdo.",
              },
              {
                q: "¿Qué pasa si nadie hace una oferta?",
                a: "Podés retirar la factura cuando quieras. No hay compromiso ni costo.",
              },
            ].map((item) => (
              <details key={item.q} className="group bg-surface-2 rounded-2xl px-5 open:pb-5">
                <summary className="cursor-pointer list-none min-h-14 flex items-center justify-between gap-4 font-semibold">
                  {item.q}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-ink-soft transition group-open:rotate-45">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </summary>
                <p className="text-ink-soft">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Contacto */}
      <section id="contacto" className="max-w-6xl mx-auto px-4 sm:px-6 py-16">
        <div className="rounded-3xl bg-accent text-white p-8 md:p-12 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h2 className="text-3xl font-bold text-white">Empezá hoy, es gratis registrarse</h2>
            <p className="text-white/80 mt-2">¿Dudas? Escribinos a {CONTACTO_EMAIL}</p>
          </div>
          <div className="flex gap-3 flex-wrap">
            <Link href="/signup" className="min-h-12 px-6 rounded-full bg-white text-accent font-bold flex items-center hover:bg-white/90">
              Crear cuenta
            </Link>
            <a href={`mailto:${CONTACTO_EMAIL}`} className="min-h-12 px-6 rounded-full border border-white/40 text-white font-semibold flex items-center hover:bg-white/10">
              Escribirnos
            </a>
          </div>
        </div>
      </section>

      <footer className="border-t border-line py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 text-sm text-ink-soft flex justify-between flex-wrap gap-4">
          <div className="flex flex-col gap-1">
            <Logo />
            <span className="max-w-[60ch]">
              Plataforma tecnológica que conecta partes. No es entidad
              financiera, no capta ni administra fondos y no brinda
              asesoramiento financiero.
            </span>
          </div>
          <div className="flex items-center gap-5 flex-wrap">
            <Link href="/terminos" className="hover:text-ink">Términos</Link>
            <Link href="/privacidad" className="hover:text-ink">Privacidad</Link>
            <span>Etapa piloto · Paraguay</span>
          </div>
        </div>
      </footer>
    </main>
  );
}

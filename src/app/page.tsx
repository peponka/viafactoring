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

/**
 * El factoring en un dibujo: la misma factura, dos momentos. Hoy cobra la
 * pyme (con un descuento) y al vencimiento cobra quien adelantó el dinero.
 */
function LineaDeTiempo() {
  return (
    <figure className="relative" aria-label="Ejemplo: una factura de 30 millones a 60 días. Hoy cobrás 28,5 millones; al vencimiento el fondeador cobra los 30 millones.">
      <div className="grid grid-cols-2 gap-3 sm:gap-6 items-end">
        <div className="vf-aparece vf-d2 rounded-2xl bg-[#9fd8c0] text-[#06291e] p-4 sm:p-5 shadow-[0_18px_40px_rgb(0_0_0_/_0.25)]">
          <p className="text-sm font-semibold">Vos cobrás hoy</p>
          <p className="num whitespace-nowrap text-[1.3rem] sm:text-[1.75rem] xl:text-[2rem] font-bold leading-tight mt-1">
            <span className="text-[0.62em] font-semibold mr-1">Gs</span>28.500.000
          </p>
        </div>
        <div className="vf-aparece vf-d3 rounded-2xl border border-white/25 p-4 sm:p-5 text-right">
          <p className="text-sm font-semibold text-white/80">El fondeador cobra al vencer</p>
          <p className="num whitespace-nowrap text-[1.3rem] sm:text-[1.75rem] xl:text-[2rem] font-bold leading-tight mt-1 text-white">
            <span className="text-[0.62em] font-semibold mr-1">Gs</span>30.000.000
          </p>
        </div>
      </div>

      <div className="relative mt-6 h-6" aria-hidden="true">
        <div className="absolute inset-x-2 top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-white/15" />
        <div className="vf-linea absolute inset-x-2 top-1/2 -translate-y-1/2 h-[3px] rounded-full bg-[#9fd8c0]" />
        <span className="absolute left-0 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-[#9fd8c0] ring-4 ring-[#9fd8c0]/25" />
        <span className="absolute right-0 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-[#0a3a2b] border-[3px] border-[#9fd8c0]" />
      </div>

      <div className="mt-3 flex justify-between text-sm">
        <span className="font-semibold text-white">Hoy</span>
        <span className="text-white/60 hidden sm:inline">Tu cliente todavía no pagó</span>
        <span className="font-semibold text-white">Día 60</span>
      </div>

      <figcaption className="vf-aparece vf-d3 mt-6 text-[0.95rem] text-white/75 max-w-[56ch]">
        La diferencia, Gs 1.500.000, es lo que gana quien te adelantó el dinero. Vos no esperás dos meses y no
        tomás un préstamo.
      </figcaption>
    </figure>
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
            <a href="#que-es" className="hidden md:inline text-sm font-semibold text-ink-soft hover:text-ink px-3 py-2">
              Qué es el factoring
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

      {/* Hero: el factoring explicado con un ejemplo */}
      <section className="bg-[#0a3a2b] text-white overflow-hidden">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 pt-14 pb-16 md:pt-20 md:pb-24 grid lg:grid-cols-[1fr_1.05fr] gap-12 lg:gap-16 items-center">
          <div className="vf-aparece vf-d1">
            <h1 className="text-white text-[2.5rem] leading-[1.04] sm:text-[3.2rem] md:text-[3.9rem] font-bold">
              Cobrá tu factura hoy, no dentro de 60 días.
            </h1>
            <p className="text-white/80 text-lg mt-6 max-w-[44ch]">
              Eso es el factoring: le vendés una factura que todavía no cobraste a alguien que te adelanta el dinero
              ahora. ViaFactoring te conecta con quienes lo hacen.
            </p>
            <div className="flex gap-3 mt-9 flex-wrap">
              <Link
                href="/signup"
                className="min-h-12 px-6 rounded-full bg-[#9fd8c0] text-[#06291e] font-bold flex items-center hover:bg-white transition-colors"
              >
                Tengo facturas por cobrar
              </Link>
              <Link
                href="/signup"
                className="min-h-12 px-6 rounded-full border border-white/35 text-white font-semibold flex items-center hover:bg-white/10 transition-colors"
              >
                Tengo capital para adelantar
              </Link>
            </div>
            <p className="mt-6 text-sm text-white/60">Gratis para pymes. ViaFactoring nunca toca el dinero.</p>
          </div>
          <LineaDeTiempo />
        </div>
      </section>

      {/* Qué es, en tres pasos */}
      <section id="que-es" className="scroll-mt-16 max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-24">
        <div className="grid lg:grid-cols-[0.9fr_1.1fr] gap-10 lg:gap-16">
          <div>
            <h2 className="text-3xl md:text-[2.6rem] leading-tight font-bold">El factoring, en simple</h2>
            <p className="text-ink-soft text-lg mt-4 max-w-[42ch]">
              En Paraguay muchas ventas entre empresas se cobran a 30, 60 o 90 días. Mientras tanto hay que
              pagar sueldos, proveedores e impuestos. El factoring resuelve esa espera.
            </p>
            <div className="mt-8 rounded-2xl bg-surface border border-line p-5 max-w-[46ch]">
              <p className="font-semibold">No es un préstamo</p>
              <p className="text-ink-soft mt-1">
                No pedís plata prestada: vendés algo que ya es tuyo, el derecho a cobrar esa factura. Por eso depende
                sobre todo de que tu cliente pague, no de tu historial en el banco.
              </p>
            </div>
          </div>
          <ol className="flex flex-col">
            {[
              ["Vendés y facturás", "Le entregás la mercadería o el servicio a tu cliente y le emitís la factura a 60 días."],
              ["Te adelantan el dinero", "Un fondeador te compra esa factura y te transfiere hoy la mayor parte del monto."],
              ["Tu cliente paga al vencer", "Cuando vence, tu cliente paga y el fondeador cobra el total. Así gana la diferencia."],
            ].map(([t, d], i) => (
              <li key={t} className="grid grid-cols-[3.25rem_1fr] gap-4 py-6 border-b border-line last:border-b-0 first:pt-0">
                <span className="num text-[2.4rem] leading-none font-bold text-accent">{i + 1}</span>
                <div>
                  <p className="text-xl font-semibold font-display">{t}</p>
                  <p className="text-ink-soft mt-1.5 max-w-[48ch]">{d}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Dos lados */}
      <section className="bg-surface border-y border-line">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-20 grid md:grid-cols-2">
          <div className="md:pr-12 pb-10 md:pb-0 border-b md:border-b-0 md:border-r border-line">
            <h2 className="text-2xl md:text-3xl font-bold">Si tenés facturas por cobrar</h2>
            <ul className="mt-5 flex flex-col gap-3 text-ink-soft">
              {[
                "Sacás una foto o subís el PDF: la IA completa los datos.",
                "Recibís ofertas y ves en claro cuánto cobrás y cuándo.",
                "Aceptás la que te convenga, o ninguna. Nunca pagás nada.",
              ].map((t) => (
                <li key={t} className="flex gap-3">
                  <Check className="text-accent mt-1 shrink-0" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
            <LinkButton href="/signup" className="mt-8">
              Publicar mi factura gratis
            </LinkButton>
          </div>
          <div className="md:pl-12 pt-10 md:pt-0">
            <h2 className="text-2xl md:text-3xl font-bold">Si tenés capital para adelantar</h2>
            <ul className="mt-5 flex flex-col gap-3 text-ink-soft">
              {[
                "Elegís montos, plazos y rubros; solo ves las facturas que encajan.",
                "Cada factura viene con una ficha de verificación hecha por IA.",
                "Pagás una comisión fija, y solo si cerrás el trato.",
              ].map((t) => (
                <li key={t} className="flex gap-3">
                  <Check className="text-accent mt-1 shrink-0" />
                  <span>{t}</span>
                </li>
              ))}
            </ul>
            <LinkButton href="/signup" variant="dark" className="mt-8">
              Registrarme como fondeador
            </LinkButton>
          </div>
        </div>
      </section>

      {/* Confianza */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-20">
        <h2 className="text-3xl md:text-[2.6rem] leading-tight font-bold max-w-[20ch]">Pensado para que confíen las dos partes</h2>
        <div className="mt-10 grid md:grid-cols-3 gap-x-10 gap-y-8">
          {[
            ["La IA revisa cada factura", "Valida el código de control, que el RUC y el monto coincidan y que la factura no esté repetida."],
            ["El dinero va directo", "El fondeador le transfiere a la empresa. ViaFactoring no recibe ni administra fondos."],
            ["Datos protegidos", "Teléfonos, emails y la factura se comparten recién cuando se cierra el trato."],
          ].map(([t, d]) => (
            <div key={t} className="border-t-2 border-accent pt-5">
              <p className="text-lg font-semibold font-display">{t}</p>
              <p className="text-ink-soft mt-2">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section id="preguntas" className="bg-surface border-y border-line scroll-mt-16">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 md:py-20">
          <h2 className="text-3xl md:text-4xl font-bold mb-8">Preguntas frecuentes</h2>
          <div className="flex flex-col">
            {[
              {
                q: "¿Cuánto me cuesta como pyme?",
                a: "Nada. Publicar facturas es gratis. El descuento lo acordás con el fondeador y lo ves antes de aceptar.",
              },
              {
                q: "¿Qué facturas puedo publicar?",
                a: "Facturas por cobrar desde USD 3.000 o su equivalente en guaraníes, a empresas privadas o al Estado.",
              },
              {
                q: "¿Cuánto paga un fondeador?",
                a: "Una comisión fija según el monto, que ve antes de ofertar. Si la pyme no acepta, no paga nada.",
              },
              {
                q: "¿ViaFactoring presta el dinero?",
                a: "No. Es una plataforma que conecta partes: no es entidad financiera, no capta ni administra fondos y no es parte del acuerdo.",
              },
            ].map((item) => (
              <details key={item.q} className="group border-b border-line">
                <summary className="cursor-pointer list-none min-h-16 flex items-center justify-between gap-4 font-semibold text-lg">
                  {item.q}
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 text-ink-soft transition group-open:rotate-45">
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                </summary>
                <p className="text-ink-soft pb-5 max-w-[60ch]">{item.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Cierre */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 md:py-20">
        <div className="rounded-[2rem] bg-[#0a3a2b] text-white p-8 md:p-14 grid md:grid-cols-[1.4fr_1fr] gap-8 items-center">
          <div>
            <h2 className="text-3xl md:text-[2.4rem] leading-tight font-bold text-white">
              Tu próxima factura puede cobrarse esta semana
            </h2>
            <p className="text-white/70 mt-3">¿Dudas? Escribinos a {CONTACTO_EMAIL}</p>
          </div>
          <div className="flex gap-3 flex-wrap md:justify-end">
            <Link href="/signup" className="min-h-12 px-6 rounded-full bg-[#9fd8c0] text-[#06291e] font-bold flex items-center hover:bg-white transition-colors">
              Crear cuenta gratis
            </Link>
            <a href={`mailto:${CONTACTO_EMAIL}`} className="min-h-12 px-6 rounded-full border border-white/35 text-white font-semibold flex items-center hover:bg-white/10 transition-colors">
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

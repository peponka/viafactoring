import Link from "next/link";
import { getUserAndProfile, homeForRole } from "@/lib/session";
import { redirect } from "next/navigation";
import { LinkButton } from "@/components/ui";

export default async function HomePage() {
  const { user, profile } = await getUserAndProfile();
  if (user && profile) {
    redirect(homeForRole(profile.role));
  }

  return (
    <main className="flex-1">
      <div className="wrap max-w-5xl mx-auto px-6">
        <nav className="flex items-center justify-between py-6">
          <div className="flex items-center gap-2.5 font-serif font-semibold text-xl">
            <span className="w-8 h-8 rounded-lg bg-accent text-accent-ink flex items-center justify-center font-mono text-sm">
              Vf
            </span>
            ViaFactoring
          </div>
          <Link
            href="/login"
            className="text-sm font-semibold text-ink-soft hover:text-ink"
          >
            Iniciar sesión
          </Link>
        </nav>

        <section className="py-16 md:py-24 grid md:grid-cols-2 gap-10 items-center">
          <div>
            <p className="uppercase tracking-widest text-[.72rem] font-semibold text-accent mb-3">
              Factoring de fletes · fluvial y camiones
            </p>
            <h1 className="text-4xl md:text-5xl font-semibold tracking-tight">
              Cobrá tu flete cuando lo hacés, no 60 días después
            </h1>
            <p className="text-ink-soft text-lg mt-5 max-w-[48ch]">
              ViaFactoring conecta operadores de barcazas y camiones con
              financieras, bancos, fondos e inversores dispuestos a
              adelantarles el cobro de sus facturas.
            </p>
            <div className="flex gap-3 mt-8 flex-wrap">
              <LinkButton href="/signup">Sumar mi flete o mi capital</LinkButton>
              <LinkButton href="/login" variant="ghost">
                Ya tengo cuenta
              </LinkButton>
            </div>
          </div>

          <div className="grid gap-4">
            <div className="bg-surface border border-line rounded-2xl p-6">
              <p className="font-serif font-semibold text-lg mb-1">
                Para operadores de flete
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
                Navegás la cartera gratis, viendo rangos de monto, plazo y
                riesgo. Gastás 1 crédito para ver el detalle completo de una
                factura que te interese.
              </p>
            </div>
          </div>
        </section>
      </div>

      <footer className="border-t border-line py-7 mt-8">
        <div className="wrap max-w-5xl mx-auto px-6 text-sm text-ink-soft flex justify-between flex-wrap gap-2">
          <span>ViaFactoring — hidrovía Paraguay-Paraná y rutas de camiones</span>
          <span>Un proyecto en etapa piloto</span>
        </div>
      </footer>
    </main>
  );
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/ui";
import { usd } from "@/lib/categorias";

export default async function AdminOverviewPage() {
  const supabase = await createClient();
  const contar = { count: "exact" as const, head: true };

  const [pymes, fondeadores, porVerificar, publicadas, negociando, cerradas, excepciones, comisiones] =
    await Promise.all([
      supabase.from("profiles").select("*", contar).eq("role", "operador"),
      supabase.from("fondeador_perfiles").select("*", contar).eq("verificacion", "aprobada"),
      supabase.from("fondeador_perfiles").select("*", contar).eq("verificacion", "en_revision"),
      supabase.from("invoices").select("*", contar).eq("estado", "disponible"),
      supabase.from("reveals").select("*", contar).in("estado", ["open", "negotiating", "offer_accepted", "closing"]),
      supabase.from("reveals").select("*", contar).eq("estado", "closed"),
      supabase.from("exceptions").select("*", contar).eq("estado", "abierta"),
      supabase.from("payment_requests").select("monto_usd, monto").eq("tipo", "comision").eq("estado", "confirmado"),
    ]);

  const cobrado = (comisiones.data ?? []).reduce((s, p) => s + Number(p.monto_usd ?? p.monto ?? 0), 0);

  const pendientes = [
    porVerificar.count
      ? { href: "/admin/fondeadores", texto: `${porVerificar.count} fondeador${porVerificar.count === 1 ? "" : "es"} esperando verificación` }
      : null,
    excepciones.count
      ? { href: "/admin/excepciones", texto: `${excepciones.count} excepci${excepciones.count === 1 ? "ón" : "ones"} para revisar` }
      : null,
  ].filter((x): x is { href: string; texto: string } => x !== null);

  const grupos: { titulo: string; items: { label: string; valor: string | number; href?: string }[] }[] = [
    {
      titulo: "Usuarios",
      items: [
        { label: "Pymes registradas", valor: pymes.count ?? 0, href: "/admin/operadores" },
        { label: "Fondeadores verificados", valor: fondeadores.count ?? 0, href: "/admin/fondeadores" },
        { label: "Por verificar", valor: porVerificar.count ?? 0, href: "/admin/fondeadores" },
      ],
    },
    {
      titulo: "Operaciones",
      items: [
        { label: "Facturas publicadas", valor: publicadas.count ?? 0, href: "/admin/facturas" },
        { label: "Negociaciones abiertas", valor: negociando.count ?? 0, href: "/admin/matches" },
        { label: "Operaciones finalizadas", valor: cerradas.count ?? 0, href: "/admin/matches" },
      ],
    },
  ];

  return (
    <div>
      <PageHeader title="Resumen" subtitle="Cómo viene ViaFactoring hoy." />

      {pendientes.length > 0 && (
        <div className="flex flex-col gap-2.5 mb-8">
          {pendientes.map((p) => (
            <Link
              key={p.href}
              href={p.href}
              className="flex items-center justify-between gap-4 rounded-2xl border border-gold/40 bg-gold-soft px-5 py-4 font-semibold hover:border-gold transition"
            >
              <span>{p.texto}</span>
              <span aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      )}

      <div className="bg-ink text-white rounded-3xl p-6 mb-8 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-sm text-white/70">Comisiones cobradas</p>
          <p className="num text-4xl font-bold mt-1">{usd(cobrado)}</p>
        </div>
        <Link href="/admin/pagos" className="text-sm font-semibold text-white/80 hover:text-white">
          Ver pagos →
        </Link>
      </div>

      <div className="flex flex-col gap-8">
        {grupos.map((g) => (
          <section key={g.titulo}>
            <h2 className="text-sm font-semibold text-ink-soft uppercase tracking-wide mb-3">{g.titulo}</h2>
            <div className="grid sm:grid-cols-3 gap-3">
              {g.items.map((s) => (
                <Link
                  key={s.label}
                  href={s.href ?? "#"}
                  className="bg-surface border border-line rounded-2xl p-5 hover:border-line-strong transition"
                >
                  <p className="text-sm text-ink-soft">{s.label}</p>
                  <p className="num text-3xl font-bold mt-1">{s.valor}</p>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

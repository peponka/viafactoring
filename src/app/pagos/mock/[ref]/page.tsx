import { notFound } from "next/navigation";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { formatMonto } from "@/lib/format";
import { simularPagoAction } from "./actions";

// Pantalla de la pasarela de PRUEBA. Solo existe con PAYMENT_PROVIDER=mock.
export default async function MockCheckoutPage({ params, searchParams }: PageProps<"/pagos/mock/[ref]">) {
  if (process.env.PAYMENT_PROVIDER !== "mock") notFound();
  const { ref } = await params;
  const { volver } = await searchParams;

  const admin = createServiceRoleClient();
  const { data: orden } = await admin
    .from("payment_requests")
    .select("tipo, monto_cobro, moneda_cobro, estado")
    .eq("provider", "mock")
    .eq("provider_ref", ref)
    .single<{ tipo: string; monto_cobro: number; moneda_cobro: string; estado: string }>();
  if (!orden) notFound();

  const botones = [
    { estado: "confirmado", label: "Pagar", clase: "bg-accent text-accent-ink" },
    { estado: "rechazado", label: "Simular pago rechazado", clase: "border border-line" },
    { estado: "procesando", label: "Simular transferencia en proceso", clase: "border border-line" },
  ];

  return (
    <main className="flex-1 flex items-center justify-center px-6 py-16">
      <div className="max-w-sm w-full rounded-2xl border border-line p-8">
        <p className="text-xs uppercase tracking-widest text-warn font-semibold mb-2">Pasarela de prueba</p>
        <p className="text-ink-soft text-sm mb-6">
          Esto simula la pasarela de pago. No se cobra nada. Se desactiva al configurar la pasarela real.
        </p>
        <p className="text-sm text-ink-soft">
          {orden.tipo === "desbloqueo" ? "Desbloqueo de oportunidad" : "Comisión de cierre"}
        </p>
        <p className="num text-3xl font-semibold mb-6">{formatMonto(orden.monto_cobro, orden.moneda_cobro)}</p>
        <div className="flex flex-col gap-2">
          {botones.map((b) => (
            <form key={b.estado} action={simularPagoAction}>
              <input type="hidden" name="ref" value={ref} />
              <input type="hidden" name="estado" value={b.estado} />
              <input type="hidden" name="volver" value={typeof volver === "string" ? volver : "/"} />
              <button type="submit" className={`w-full rounded-xl px-4 py-3 font-semibold ${b.clase}`}>
                {b.label}
              </button>
            </form>
          ))}
        </div>
      </div>
    </main>
  );
}

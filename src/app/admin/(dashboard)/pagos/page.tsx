import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card } from "@/components/ui";
import { formatFechaHora, formatMonto, TIPO_PAGO_LABEL } from "@/lib/format";
import type { PaymentRequest, Profile } from "@/lib/database.types";

// Solo consulta. Los pagos los confirma la pasarela (webhook verificado);
// lo que no cuadra aparece en Excepciones.
const TONO: Record<string, "good" | "warn" | "critical" | "neutral"> = {
  confirmado: "good",
  pendiente: "neutral",
  procesando: "warn",
  fallido: "critical",
  rechazado: "critical",
  vencido: "neutral",
  devuelto: "neutral",
  cancelado: "neutral",
};

export default async function AdminPagosPage() {
  const supabase = await createClient();
  const { data: pagos } = await supabase
    .from("payment_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200)
    .returns<PaymentRequest[]>();

  const fondeadorIds = [...new Set((pagos ?? []).map((p) => p.fondeador_id))];
  const { data: perfiles } = fondeadorIds.length
    ? await supabase.from("profiles").select("*").in("id", fondeadorIds).returns<Profile[]>()
    : { data: [] as Profile[] };
  const nombreDe = (id: string) => perfiles?.find((p) => p.id === id)?.nombre ?? id;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-2">Pagos</h1>
      <p className="text-sm text-ink-soft mb-6">
        Registro de solo lectura. Los pagos se confirman automáticamente con el aviso verificado de la pasarela.
      </p>
      {!pagos || pagos.length === 0 ? (
        <Card>
          <p className="text-ink-soft text-sm">Todavía no hay pagos.</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {pagos.map((p) => (
            <Card key={p.id} className="!p-4">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div className="text-sm">
                  <p className="font-semibold">{nombreDe(p.fondeador_id)}</p>
                  <p className="text-ink-soft">
                    {p.monto_usd != null ? formatMonto(p.monto_usd, "USD") : formatMonto(p.monto, p.moneda)}
                    {p.monto_cobro != null && p.moneda_cobro ? ` → ${formatMonto(p.monto_cobro, p.moneda_cobro)}` : ""}
                    {p.tipo_cambio ? ` · TC ${p.tipo_cambio}` : ""} · {formatFechaHora(p.created_at)}
                  </p>
                  <p className="text-xs text-ink-soft mt-1 break-all">
                    {p.provider ?? "sin pasarela"}
                    {p.provider_ref ? ` · ${p.provider_ref}` : ""}
                    {p.reveal_id ? (
                      <>
                        {" · "}
                        <Link className="underline" href={`/deal-room/${p.reveal_id}`}>
                          Deal Room
                        </Link>
                      </>
                    ) : null}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="gold">{TIPO_PAGO_LABEL[p.tipo]}</Badge>
                  <Badge tone={TONO[p.estado] ?? "neutral"}>{p.estado}</Badge>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

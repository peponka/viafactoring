import { createClient } from "@/lib/supabase/server";
import { Badge, Card } from "@/components/ui";
import { formatFecha, formatMonto } from "@/lib/format";
import type { PaymentRequest, Profile } from "@/lib/database.types";
import { PagoRow } from "./pago-row";

export default async function AdminPagosPage() {
  const supabase = await createClient();
  const { data: pagos } = await supabase
    .from("payment_requests")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<PaymentRequest[]>();

  const fondeadorIds = [...new Set((pagos ?? []).map((p) => p.fondeador_id))];
  const { data: perfiles } = fondeadorIds.length
    ? await supabase
        .from("profiles")
        .select("*")
        .in("id", fondeadorIds)
        .returns<Profile[]>()
    : { data: [] as Profile[] };
  const nombreDe = (id: string) =>
    perfiles?.find((p) => p.id === id)?.nombre ?? id;

  const estadoTone = { pendiente: "warn", confirmado: "good", cancelado: "neutral" } as const;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Pagos</h1>
      {!pagos || pagos.length === 0 ? (
        <Card>
          <p className="text-ink-soft text-sm">Todavía no hay solicitudes de pago.</p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {pagos.map((p) => (
            <Card key={p.id}>
              <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
                <div>
                  <p className="font-semibold">{nombreDe(p.fondeador_id)}</p>
                  <p className="text-sm text-ink-soft">
                    {formatMonto(p.monto, p.moneda)} · solicitado el{" "}
                    {formatFecha(p.created_at)}
                  </p>
                </div>
                <Badge tone={estadoTone[p.estado]}>{p.estado}</Badge>
              </div>
              <PagoRow pago={p} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

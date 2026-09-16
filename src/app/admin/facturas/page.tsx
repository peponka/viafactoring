import { createClient } from "@/lib/supabase/server";
import { Badge, Card } from "@/components/ui";
import {
  ESTADO_FACTURA_LABEL,
  RUBRO_LABEL,
  formatFecha,
  formatMonto,
} from "@/lib/format";
import type { Invoice, Profile } from "@/lib/database.types";
import { CerrarButton } from "./cerrar-button";

export default async function AdminFacturasPage() {
  const supabase = await createClient();
  const { data: facturas } = await supabase
    .from("invoices")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<Invoice[]>();

  const operadorIds = [...new Set((facturas ?? []).map((f) => f.operador_id))];
  const { data: perfiles } = operadorIds.length
    ? await supabase
        .from("profiles")
        .select("*")
        .in("id", operadorIds)
        .returns<Profile[]>()
    : { data: [] as Profile[] };
  const nombreDe = (id: string) =>
    perfiles?.find((p) => p.id === id)?.nombre ?? id;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Todas las facturas</h1>
      {!facturas || facturas.length === 0 ? (
        <Card>
          <p className="text-ink-soft text-sm">Sin facturas cargadas todavía.</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {facturas.map((f) => (
            <Card key={f.id} className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <Badge>{RUBRO_LABEL[f.rubro]}</Badge>
                  <Badge tone={f.estado === "disponible" ? "good" : "neutral"}>
                    {ESTADO_FACTURA_LABEL[f.estado]}
                  </Badge>
                </div>
                <p className="font-medium">{f.deudor_nombre}</p>
                <p className="text-sm text-ink-soft">
                  {nombreDe(f.operador_id)} · {formatMonto(f.monto, f.moneda)} ·
                  cargada {formatFecha(f.created_at)}
                </p>
              </div>
              {f.estado === "disponible" && <CerrarButton invoiceId={f.id} />}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

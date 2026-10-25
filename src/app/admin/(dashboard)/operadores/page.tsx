import { createClient } from "@/lib/supabase/server";
import { Badge, Card, PageHeader } from "@/components/ui";
import {
  ESTADO_FACTURA_LABEL,
  sectorLabel,
  formatFecha,
  formatMonto,
} from "@/lib/format";
import type { Invoice, Profile } from "@/lib/database.types";

export default async function AdminOperadoresPage() {
  const supabase = await createClient();
  const { data: operadores } = await supabase
    .from("profiles")
    .select("*")
    .eq("role", "operador")
    .order("created_at", { ascending: false })
    .returns<Profile[]>();

  const ids = (operadores ?? []).map((o) => o.id);
  const { data: facturas } = ids.length
    ? await supabase
        .from("invoices")
        .select("*")
        .in("operador_id", ids)
        .order("created_at", { ascending: false })
        .returns<Invoice[]>()
    : { data: [] as Invoice[] };

  const facturasDe = (id: string) =>
    (facturas ?? []).filter((f) => f.operador_id === id);

  return (
    <div>
      <PageHeader
        title="Pymes"
        subtitle={`${operadores?.length ?? 0} registradas · contacto y todas sus facturas en un solo lugar.`}
      />
      {!operadores || operadores.length === 0 ? (
        <Card>
          <p className="text-ink-soft text-sm">
            Todavía no hay pymes registradas.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {operadores.map((o) => {
            const suyas = facturasDe(o.id);
            const disponibles = suyas.filter(
              (f) => f.estado === "disponible",
            ).length;
            return (
              <Card key={o.id}>
                <div className="flex items-start justify-between gap-4 flex-wrap mb-3">
                  <div>
                    <p className="font-semibold">{o.nombre}</p>
                    <p className="text-sm text-ink-soft">
                      {o.email ? `${o.email} · ` : ""}
                      {o.telefono ? `${o.telefono} · ` : ""}
                      {o.empresa ? `${o.empresa} · ` : ""}
                      desde {formatFecha(o.created_at)}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="num text-2xl font-bold">{suyas.length}</p>
                    <p className="text-xs text-ink-soft">
                      {suyas.length === 1 ? "factura" : "facturas"} · {disponibles} publicada{disponibles === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                {suyas.length > 0 && (
                  <div className="grid gap-2 border-t border-line pt-3">
                    {suyas.map((f) => (
                      <div
                        key={f.id}
                        className="flex items-center justify-between gap-3 flex-wrap text-sm"
                      >
                        <div className="flex items-center gap-2 flex-wrap">
                          <Badge
                            tone={
                              f.estado === "disponible" ? "good" : "neutral"
                            }
                          >
                            {ESTADO_FACTURA_LABEL[f.estado]}
                          </Badge>
                          <Badge>{sectorLabel(null, f.rubro)}</Badge>
                          <span>{f.deudor_nombre}</span>
                        </div>
                        <span className="text-ink-soft">
                          {formatMonto(f.monto, f.moneda)} · cargada{" "}
                          {formatFecha(f.created_at)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

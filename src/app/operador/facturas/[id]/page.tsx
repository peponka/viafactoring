import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserAndProfile } from "@/lib/session";
import { Badge, Card } from "@/components/ui";
import { formatFecha, formatMonto, RIESGO_LABEL, RUBRO_LABEL } from "@/lib/format";
import type { Invoice } from "@/lib/database.types";
import { RetirarButton } from "./retirar-button";

export default async function FacturaDetallePage({
  params,
}: PageProps<"/operador/facturas/[id]">) {
  const { id } = await params;
  const { profile } = await getUserAndProfile();
  const supabase = await createClient();

  const { data: factura } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .eq("operador_id", profile!.id)
    .single<Invoice>();

  if (!factura) notFound();

  const { data: reveals } = await supabase
    .from("reveals")
    .select("revealed_at, contactado")
    .eq("invoice_id", id);

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Badge>{RUBRO_LABEL[factura.rubro]}</Badge>
        <Badge>{RIESGO_LABEL[factura.riesgo]}</Badge>
        <Badge tone={factura.estado === "disponible" ? "good" : "neutral"}>
          {factura.estado}
        </Badge>
      </div>
      <h1 className="text-2xl font-semibold mb-1">{factura.deudor_nombre}</h1>
      <p className="text-ink-soft mb-6">
        {formatMonto(factura.monto, factura.moneda)} · vence{" "}
        {formatFecha(factura.fecha_vencimiento)} · {factura.plazo_dias} días
      </p>

      <Card className="mb-6">
        <p className="font-semibold mb-3">
          {reveals?.length ?? 0} fondeador(es) vieron el detalle completo
        </p>
        {reveals && reveals.length > 0 ? (
          <ul className="flex flex-col gap-2 text-sm text-ink-soft">
            {reveals.map((r, i) => (
              <li key={i}>
                {formatFecha(r.revealed_at)} —{" "}
                {r.contactado ? "ya te contactaron" : "todavía sin contacto"}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-ink-soft">
            Todavía nadie vio el detalle completo de esta factura.
          </p>
        )}
      </Card>

      {factura.estado === "disponible" && (
        <RetirarButton invoiceId={factura.id} />
      )}
    </div>
  );
}

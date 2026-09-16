import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserAndProfile } from "@/lib/session";
import { Badge, Card } from "@/components/ui";
import { formatFecha, formatMonto, RIESGO_LABEL, RUBRO_LABEL } from "@/lib/format";
import type { InvoiceTeaser } from "@/lib/database.types";
import { RevealButton } from "./reveal-button";
import { DocumentoLink } from "./documento";
import { ContactadoButton } from "./contactado-button";

function riesgoTone(riesgo: string) {
  if (riesgo === "bajo") return "good" as const;
  if (riesgo === "alto") return "critical" as const;
  return "warn" as const;
}

type InvoiceDetalle = {
  deudor_nombre: string;
  deudor_contacto: string | null;
  operador_contacto: string | null;
  monto: number;
  moneda: string;
  fecha_vencimiento: string | null;
  numero: string | null;
  documento_url: string | null;
};

export default async function FacturaFondeadorPage({
  params,
}: PageProps<"/fondeador/facturas/[id]">) {
  const { id } = await params;
  const { profile } = await getUserAndProfile();
  const supabase = await createClient();

  const { data: teaser } = await supabase
    .from("invoice_teasers")
    .select("*")
    .eq("id", id)
    .single<InvoiceTeaser>();

  if (!teaser) notFound();

  let reveal: { contactado: boolean } | null = null;
  let invoice: InvoiceDetalle | null = null;

  if (teaser.ya_revelada) {
    const { data: fullInvoice } = await supabase.rpc("reveal_invoice", {
      p_invoice_id: id,
    });
    invoice = (fullInvoice as InvoiceDetalle | null) ?? null;

    const { data: r } = await supabase
      .from("reveals")
      .select("contactado")
      .eq("invoice_id", id)
      .eq("fondeador_id", profile!.id)
      .maybeSingle();
    reveal = r;
  }

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Badge>{RUBRO_LABEL[teaser.rubro]}</Badge>
        <Badge tone={riesgoTone(teaser.riesgo)}>{RIESGO_LABEL[teaser.riesgo]}</Badge>
      </div>

      {invoice ? (
        <>
          <h1 className="text-2xl font-semibold mb-1">
            {invoice.deudor_nombre}
            {invoice.numero ? ` · Nº ${invoice.numero}` : ""}
          </h1>
          <p className="text-ink-soft mb-6">
            {formatMonto(invoice.monto, invoice.moneda)} · vence{" "}
            {formatFecha(invoice.fecha_vencimiento)}
          </p>

          <Card className="mb-4 grid gap-3">
            <div>
              <p className="text-ink-soft text-xs uppercase tracking-wide">
                Contacto del deudor
              </p>
              <p className="font-medium">{invoice.deudor_contacto || "No informado"}</p>
            </div>
            <div>
              <p className="text-ink-soft text-xs uppercase tracking-wide">
                Contacto del operador
              </p>
              <p className="font-medium">{invoice.operador_contacto || "No informado"}</p>
            </div>
            {teaser.descripcion && (
              <div>
                <p className="text-ink-soft text-xs uppercase tracking-wide">
                  Descripción
                </p>
                <p>{teaser.descripcion}</p>
              </div>
            )}
          </Card>

          <div className="flex items-center gap-4 flex-wrap">
            {invoice.documento_url && <DocumentoLink invoiceId={id} />}
            <ContactadoButton invoiceId={id} yaContactado={!!reveal?.contactado} />
          </div>
        </>
      ) : (
        <>
          <h1 className="text-2xl font-semibold mb-1">
            Factura {RUBRO_LABEL[teaser.rubro].toLowerCase()}
          </h1>
          {teaser.descripcion && (
            <p className="text-ink-soft mb-6">{teaser.descripcion}</p>
          )}
          <Card className="mb-6 grid grid-cols-2 gap-4">
            <div>
              <p className="text-ink-soft text-xs uppercase tracking-wide">
                Monto aprox.
              </p>
              <p className="num text-lg font-medium">{teaser.monto_banda}</p>
            </div>
            <div>
              <p className="text-ink-soft text-xs uppercase tracking-wide">
                Plazo
              </p>
              <p className="num text-lg font-medium">{teaser.plazo_banda}</p>
            </div>
            <div className="col-span-2">
              <p className="text-ink-soft text-xs uppercase tracking-wide">
                Deudor y documento
              </p>
              <p className="font-medium">🔒 se revelan al gastar 1 crédito</p>
            </div>
          </Card>
          <RevealButton invoiceId={id} />
        </>
      )}
    </div>
  );
}

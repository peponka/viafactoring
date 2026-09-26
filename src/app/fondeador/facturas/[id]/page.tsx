import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserAndProfile } from "@/lib/session";
import { Badge, Card } from "@/components/ui";
import { formatFecha, formatMonto, RIESGO_LABEL, rubroLabel } from "@/lib/format";
import type { InvoiceTeaser, PaymentRequest } from "@/lib/database.types";
import { UnlockButton } from "./unlock-button";

function riesgoTone(riesgo: string) {
  if (riesgo === "bajo") return "good" as const;
  if (riesgo === "alto") return "critical" as const;
  return "warn" as const;
}

// Nivel 1 (ficha pública). Una vez desbloqueada, la operación se trabaja en
// su Deal Room: información ampliada, chat, documentos y ofertas.
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

  if (teaser.ya_revelada) {
    const { data: room } = await supabase
      .from("reveals")
      .select("id")
      .eq("invoice_id", id)
      .eq("fondeador_id", profile!.id)
      .maybeSingle<{ id: string }>();
    if (room) redirect(`/deal-room/${room.id}`);
  }

  const { data: pendingRequest } = await supabase
    .from("payment_requests")
    .select("*")
    .eq("invoice_id", id)
    .eq("fondeador_id", profile!.id)
    .eq("tipo", "desbloqueo")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle<PaymentRequest>();

  const datosSector = Object.entries(teaser.industry_data_publica ?? {});

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Badge>{teaser.industria_nombre ?? rubroLabel(teaser.rubro)}</Badge>
        <Badge tone={riesgoTone(teaser.riesgo)}>{RIESGO_LABEL[teaser.riesgo]}</Badge>
      </div>

      <h1 className="text-2xl font-semibold mb-1">
        Operación {(teaser.industria_nombre ?? rubroLabel(teaser.rubro)).toLowerCase()}
      </h1>
      {teaser.descripcion && <p className="text-ink-soft mb-6">{teaser.descripcion}</p>}

      <Card className="mb-6 grid grid-cols-2 gap-4">
        <div>
          <p className="text-ink-soft text-xs uppercase tracking-wide">Monto de la factura</p>
          <p className="num text-lg font-medium">{formatMonto(teaser.monto, teaser.moneda)}</p>
        </div>
        <div>
          <p className="text-ink-soft text-xs uppercase tracking-wide">Plazo</p>
          <p className="num text-lg font-medium">{teaser.plazo_banda}</p>
        </div>
        <div>
          <p className="text-ink-soft text-xs uppercase tracking-wide">Vencimiento</p>
          <p className="num text-lg font-medium">{formatFecha(teaser.fecha_vencimiento)}</p>
        </div>
        <div>
          <p className="text-ink-soft text-xs uppercase tracking-wide">
            {teaser.ubicacion ? "Ubicación" : "Estado"}
          </p>
          <p className="font-medium capitalize">{teaser.ubicacion ?? teaser.estado}</p>
        </div>
        {datosSector.map(([k, v]) => (
          <div key={k}>
            <p className="text-ink-soft text-xs uppercase tracking-wide">{k.replaceAll("_", " ")}</p>
            <p className="font-medium">{String(v)}</p>
          </div>
        ))}
        <div className="col-span-2">
          <p className="text-ink-soft text-xs uppercase tracking-wide">Al desbloquear</p>
          <p className="text-sm">
            Accedés al Deal Room de esta operación: deudor e identidad de la PyME, documentación,
            chat para preguntar y la posibilidad de ofertar. El contacto directo se habilita al
            cerrar el acuerdo.
          </p>
        </div>
      </Card>

      {teaser.estado === "disponible" ? (
        <UnlockButton
          invoiceId={id}
          fee={teaser.unlock_fee}
          moneda={teaser.moneda}
          pendingRequest={pendingRequest ?? null}
        />
      ) : (
        <p className="text-sm text-ink-soft">Esta operación ya no está disponible.</p>
      )}
    </div>
  );
}

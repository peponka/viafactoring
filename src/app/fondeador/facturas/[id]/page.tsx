import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserAndProfile } from "@/lib/session";
import { Badge, Card } from "@/components/ui";
import { formatFecha, formatMonto, RIESGO_LABEL, rubroLabel } from "@/lib/format";
import type { InvoiceTeaser } from "@/lib/database.types";
import { InteresButton } from "./interes-button";

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
  await getUserAndProfile();
  const supabase = await createClient();

  const { data: teaser } = await supabase
    .from("invoice_teasers")
    .select("*")
    .eq("id", id)
    .single<InvoiceTeaser>();

  if (!teaser) notFound();

  // Si ya marcó interés, el Deal Room existe: se entra directo.
  if (teaser.ya_revelada) {
    const { data: room } = await supabase
      .from("reveals")
      .select("id")
      .eq("invoice_id", id)
      .maybeSingle<{ id: string }>();
    if (room?.id) redirect(`/deal-room/${room.id}`);
  }

  const datosSector = Object.entries(teaser.industry_data_publica ?? {});

  return (
    <div className="max-w-2xl">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Badge>{teaser.industria_nombre ?? rubroLabel(teaser.rubro)}</Badge>
        <Badge tone={riesgoTone(teaser.riesgo)}>{RIESGO_LABEL[teaser.riesgo]}</Badge>
      </div>

      <h1 className="text-[1.75rem] font-bold mb-1">
        Operación {(teaser.industria_nombre ?? rubroLabel(teaser.rubro)).toLowerCase()}
      </h1>
      {teaser.descripcion && <p className="text-ink-soft mb-6">{teaser.descripcion}</p>}

      <Card className="mb-6 grid grid-cols-2 gap-4">
        <div>
          <p className="text-ink-soft text-xs uppercase tracking-wide">Deudor</p>
          <p className="font-medium">{teaser.deudor_tipo === "estado" ? "Estado" : "Empresa privada"}</p>
        </div>
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
          <p className="text-ink-soft text-xs uppercase tracking-wide">Al tocar «Me interesa»</p>
          <p className="text-sm">
            Entrás a la sala de negociación con la pyme: ves el deudor, la ficha de verificación y
            los documentos, podés preguntar por chat y hacer tu oferta. El contacto directo se
            muestra al cerrar el acuerdo.
          </p>
        </div>
      </Card>

      {teaser.estado === "disponible" ? (
        <InteresButton invoiceId={id} />
      ) : (
        <p className="text-sm text-ink-soft">Esta operación ya no está disponible.</p>
      )}
    </div>
  );
}

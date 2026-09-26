import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card } from "@/components/ui";
import {
  ESTADO_DEAL_ROOM_LABEL,
  NIVEL_LABEL,
  estadoDealRoomTone,
  formatFecha,
  formatMonto,
  rubroLabel,
} from "@/lib/format";
import type { DealRoomDetail, DocumentRow, Message } from "@/lib/database.types";
import { Chat } from "./chat";
import { Ofertas } from "./ofertas";
import { Cierre, Checklist, CancelarDealRoom, Documentos } from "./panel";

const MOTIVO_CANCELACION: Record<string, string> = {
  cerrada_con_otro_fondeador: "La PyME cerró esta factura con otro fondeador.",
  factura_retirada: "La PyME retiró la factura del marketplace.",
  factura_cerrada: "La factura fue cerrada por administración.",
  factura_no_disponible: "La factura ya no está disponible.",
  retiro_fondeador: "El fondeador cerró este Deal Room.",
  retiro_operador: "La PyME cerró este Deal Room.",
};

function Niveles({ nivel }: { nivel: number }) {
  return (
    <ol className="flex items-center gap-2 text-xs flex-wrap">
      {[1, 2, 3, 4].map((n) => (
        <li
          key={n}
          className={`px-2.5 py-1 rounded-full border ${
            n <= nivel ? "border-accent text-accent font-semibold" : "border-line text-ink-soft"
          }`}
        >
          {n}. {NIVEL_LABEL[n]}
        </li>
      ))}
    </ol>
  );
}

export default async function DealRoomPage({ params }: PageProps<"/deal-room/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

  // La base decide si el usuario es parte y qué información ve según el
  // nivel. Un ID ajeno devuelve error → 404.
  const { data, error } = await supabase.rpc("get_deal_room_detail", { p_reveal_id: id });
  if (error || !data) notFound();
  const d = data as DealRoomDetail;

  const [{ data: mensajes }, { data: docs }] = await Promise.all([
    supabase
      .from("messages")
      .select("*")
      .eq("reveal_id", id)
      .order("created_at", { ascending: true })
      .returns<Message[]>(),
    supabase
      .from("documents")
      .select("id, invoice_id, reveal_id, subido_por, nombre, mime, tipo, nivel_minimo, created_at")
      .eq("invoice_id", d.invoice.id)
      .order("created_at", { ascending: true })
      .returns<DocumentRow[]>(),
  ]);

  // Documentos de la factura + los compartidos en ESTE Deal Room (la PyME
  // puede ver los de otros Deal Rooms de su factura, pero no van acá).
  const documentos = (docs ?? []).filter((doc) => !doc.reveal_id || doc.reveal_id === id);
  const inv = d.invoice;
  const cancelado = d.estado === "cancelled";
  const volver = d.rol === "operador" ? `/operador/facturas/${inv.id}` : "/fondeador/deal-rooms";
  const datosSector = Object.entries(inv.industry_data ?? {});

  return (
    <div>
      <Link href={volver} className="text-sm text-ink-soft hover:text-ink">
        ← Volver
      </Link>

      <div className="flex items-start justify-between gap-4 flex-wrap mt-3 mb-6">
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <Badge tone={estadoDealRoomTone(d.estado)}>{ESTADO_DEAL_ROOM_LABEL[d.estado]}</Badge>
            <Badge>{rubroLabel(inv.rubro)}</Badge>
          </div>
          <h1 className="text-2xl font-semibold">
            Deal Room · {inv.deudor_nombre}
            {inv.numero ? ` · Nº ${inv.numero}` : ""}
          </h1>
          <p className="text-ink-soft mt-1">
            {formatMonto(inv.monto, inv.moneda)} · vence {formatFecha(inv.fecha_vencimiento)} ·{" "}
            {inv.plazo_dias} días
            {inv.ubicacion ? ` · ${inv.ubicacion}` : ""}
          </p>
          <p className="text-sm mt-1">
            {d.rol === "fondeador" ? "PyME" : "Fondeador"}:{" "}
            <span className="font-medium">
              {d.contraparte.empresa || d.contraparte.nombre || "—"}
            </span>
          </p>
        </div>
        <Niveles nivel={d.nivel} />
      </div>

      {cancelado && (
        <Card className="!p-4 mb-6 bg-surface-2">
          <p className="text-sm">
            Este Deal Room está cerrado.{" "}
            {d.cancelado_motivo ? MOTIVO_CANCELACION[d.cancelado_motivo] ?? d.cancelado_motivo : ""}
          </p>
        </Card>
      )}

      <div className="grid lg:grid-cols-[1fr_360px] gap-6 items-start">
        <Card className="!p-5">
          <p className="font-semibold mb-3">Conversación</p>
          <Chat
            revealId={id}
            rol={d.rol}
            mensajes={mensajes ?? []}
            documentos={documentos}
            soloLectura={cancelado || d.rol === "admin"}
          />
        </Card>

        <div className="flex flex-col gap-4">
          <Card className="!p-5">
            <Ofertas d={d} />
          </Card>

          {d.ofertas.some((o) => o.estado === "aceptada") && (
            <Card className="!p-5">
              <Cierre d={d} />
            </Card>
          )}

          <Card className="!p-5">
            <p className="font-semibold mb-2">La operación</p>
            <dl className="text-sm grid gap-1">
              <div><dt className="inline text-ink-soft">Deudor: </dt><dd className="inline">{inv.deudor_nombre}</dd></div>
              <div><dt className="inline text-ink-soft">Monto: </dt><dd className="inline num">{formatMonto(inv.monto, inv.moneda)}</dd></div>
              <div><dt className="inline text-ink-soft">Vencimiento: </dt><dd className="inline num">{formatFecha(inv.fecha_vencimiento)}</dd></div>
              {datosSector.map(([k, v]) => (
                <div key={k}>
                  <dt className="inline text-ink-soft capitalize">{k.replaceAll("_", " ")}: </dt>
                  <dd className="inline">{String(v)}</dd>
                </div>
              ))}
            </dl>
            {inv.descripcion && <p className="text-sm mt-2">{inv.descripcion}</p>}
          </Card>

          <Card className="!p-5">
            <Documentos d={d} documentos={documentos} />
          </Card>

          <Card className="!p-5">
            <Checklist d={d} />
          </Card>

          <CancelarDealRoom d={d} />
        </div>
      </div>
    </div>
  );
}

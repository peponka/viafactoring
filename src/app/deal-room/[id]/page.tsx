import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { formatMonto } from "@/lib/format";
import { ETAPAS, franjaDeTurno, nombreContraparte } from "@/lib/turno";
import type { DealRoomDetail, DocumentRow, Message } from "@/lib/database.types";
import { Sala } from "./sala";
import { Costado } from "./costado";
import { Menu } from "./menu";

// El Deal Room es una sala de negociación: una línea arriba, la
// conversación en el centro (con las ofertas, el pago y el contacto como
// tarjetas del hilo) y un costado con los datos. Qué ve cada uno y qué le
// toca lo decide la base.
export default async function DealRoomPage({ params }: PageProps<"/deal-room/[id]">) {
  const { id } = await params;
  const supabase = await createClient();

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

  const documentos = (docs ?? []).filter((doc) => !doc.reveal_id || doc.reveal_id === id);
  const inv = d.invoice;
  const volver = d.rol === "operador" ? "/operador/deal-rooms" : d.rol === "admin" ? "/admin/matches" : "/fondeador/deal-rooms";
  const etapaIdx = ETAPAS.findIndex((e) => e.key === d.etapa);
  const negociable = d.estado === "open" || d.estado === "negotiating";
  const quien = d.rol === "fondeador" ? "PyME" : "Fondeador";

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link href={volver} className="text-xs text-ink-soft hover:text-ink">
            ← Volver
          </Link>
          <h1 className="font-semibold text-lg leading-snug mt-1 truncate">
            {nombreContraparte(d)}
            {inv.numero ? ` · Factura ${inv.numero}` : ""} · {formatMonto(inv.monto, inv.moneda)}
          </h1>
          <p className="text-xs text-ink-soft mt-1">
            {d.etapa === "cerrada" ? (
              "Negociación cerrada"
            ) : (
              ETAPAS.map((e, i) => (
                <span key={e.key} className={i === etapaIdx ? "text-accent font-semibold" : ""}>
                  {i > 0 ? " · " : ""}
                  {e.label}
                </span>
              ))
            )}
            <span className="sr-only"> — negociás con {quien}</span>
          </p>
        </div>
        {d.rol !== "admin" && <Menu revealId={id} puedeRetirarse={negociable} />}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_300px] gap-5 items-start">
        <Sala
          d={d}
          mensajes={mensajes ?? []}
          documentos={documentos}
          franja={franjaDeTurno(d)}
        />
        <Costado d={d} documentos={documentos} />
      </div>
    </div>
  );
}

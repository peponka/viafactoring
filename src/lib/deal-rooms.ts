import "server-only";
import { createClient } from "@/lib/supabase/server";
import { formatMonto } from "@/lib/format";
import type {
  DealRoomDetail,
  EstadoDealRoom,
  Invoice,
  InvoiceTeaser,
  Message,
  Offer,
  Reveal,
} from "@/lib/database.types";

export type RoomResumen = {
  revealId: string;
  invoiceId: string;
  titulo: string;
  subtitulo: string;
  estado: EstadoDealRoom;
  ultimaActividad: string;
  noLeidos: number;
  // "Te toca a vos": lo que esta persona tiene pendiente en el Deal Room
  pendientes: string[];
};

const ACTIVOS: EstadoDealRoom[] = ["open", "negotiating", "offer_accepted", "closing"];

// Resumen de los Deal Rooms del usuario logueado. Todo pasa por RLS: cada
// consulta devuelve solo lo que ese usuario puede ver.
export async function getMisDealRooms(rol: "fondeador" | "operador"): Promise<RoomResumen[]> {
  const supabase = await createClient();

  const { data: reveals } = await supabase
    .from("reveals")
    .select("*")
    .order("ultima_actividad_at", { ascending: false })
    .returns<Reveal[]>();

  if (!reveals || reveals.length === 0) return [];

  const revealIds = reveals.map((r) => r.id);
  const invoiceIds = [...new Set(reveals.map((r) => r.invoice_id))];
  const otroRol = rol === "fondeador" ? "operador" : "fondeador";

  const [{ data: offers }, { data: mensajes }] = await Promise.all([
    supabase
      .from("offers")
      .select("*")
      .in("reveal_id", revealIds)
      .returns<Offer[]>(),
    supabase
      .from("messages")
      .select("id, reveal_id, autor_rol, leido_at")
      .in("reveal_id", revealIds)
      .eq("autor_rol", otroRol)
      .returns<Pick<Message, "id" | "reveal_id" | "autor_rol" | "leido_at">[]>(),
  ]);

  // Datos de la factura: la PyME lee su tabla; el fondeador, la vista pública
  // (que incluye las operaciones que ya desbloqueó).
  let titulos = new Map<string, { titulo: string; subtitulo: string }>();
  if (rol === "operador") {
    const { data: invoices } = await supabase
      .from("invoices")
      .select("*")
      .in("id", invoiceIds)
      .returns<Invoice[]>();
    const detalles = await Promise.all(
      reveals.map((r) =>
        supabase
          .rpc("get_deal_room_detail", { p_reveal_id: r.id })
          .then(({ data }) => [r.id, data as DealRoomDetail | null] as const),
      ),
    );
    const contraparte = new Map(detalles);
    titulos = new Map(
      reveals.map((r) => {
        const inv = invoices?.find((i) => i.id === r.invoice_id);
        const cp = contraparte.get(r.id)?.contraparte;
        return [
          r.id,
          {
            titulo: cp?.empresa || cp?.nombre || "Fondeador",
            subtitulo: inv
              ? `${inv.deudor_nombre} · ${formatMonto(inv.monto, inv.moneda)}`
              : "",
          },
        ];
      }),
    );
  } else {
    const { data: teasers } = await supabase
      .from("invoice_teasers")
      .select("*")
      .in("id", invoiceIds)
      .returns<InvoiceTeaser[]>();
    titulos = new Map(
      reveals.map((r) => {
        const t = teasers?.find((x) => x.id === r.invoice_id);
        return [
          r.id,
          {
            titulo: t ? formatMonto(t.monto, t.moneda) : "Operación",
            subtitulo: t
              ? [t.industria_nombre ?? t.rubro, t.plazo_dias ? `${t.plazo_dias} días` : null]
                  .filter(Boolean)
                  .join(" · ")
              : "",
          },
        ];
      }),
    );
  }

  return reveals.map((r) => {
    const pendientes: string[] = [];
    const ofertasRoom = (offers ?? []).filter((o) => o.reveal_id === r.id);
    const pendiente = ofertasRoom.find((o) => o.estado === "pendiente");
    const aceptada = ofertasRoom.find((o) => o.estado === "aceptada");
    const msgs = (mensajes ?? []).filter((m) => m.reveal_id === r.id);

    if (ACTIVOS.includes(r.estado)) {
      if (pendiente && pendiente.autor_rol === otroRol) {
        pendientes.push(
          pendiente.parent_offer_id ? "Responder la contraoferta" : "Responder la oferta",
        );
      }
      if (rol === "fondeador" && r.estado === "offer_accepted") {
        pendientes.push("Pagar la comisión de cierre");
      }
      if (r.estado === "closing" && aceptada) {
        if (rol === "fondeador" && !aceptada.fondos_enviados_at) {
          pendientes.push("Avisar que enviaste los fondos");
        }
        if (rol === "operador" && !aceptada.fondos_recibidos_at) {
          pendientes.push("Confirmar que recibiste los fondos");
        }
      }
    }

    const t = titulos.get(r.id);
    return {
      revealId: r.id,
      invoiceId: r.invoice_id,
      titulo: t?.titulo ?? "Deal Room",
      subtitulo: t?.subtitulo ?? "",
      estado: r.estado,
      ultimaActividad: r.ultima_actividad_at,
      noLeidos: msgs.filter((m) => !m.leido_at).length,
      pendientes,
    };
  });
}

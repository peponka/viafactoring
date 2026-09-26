import { formatFecha, formatFechaHora, formatMonto } from "@/lib/format";
import type { DealRoomDetail, EtapaVisible } from "@/lib/database.types";

// La franja de turno: una frase, y como máximo la acción que corresponde.
// Qué toca y a quién lo decide la base (turno_deal_room); acá solo se
// traduce a palabras para quien está mirando.

export type AccionFranja =
  | { tipo: "responder_oferta"; offerId: string; monto: number; esContraoferta: boolean }
  | { tipo: "pagar_comision"; reintento: boolean }
  | { tipo: "declarar"; offerId: string; lado: "envio" | "recepcion" };

export type Franja = {
  tono: "accion" | "espera" | "info";
  titulo: string;
  texto: string | null;
  accion: AccionFranja | null;
  refrescar?: boolean; // esperando una confirmación externa
};

export const ETAPAS: { key: EtapaVisible; label: string }[] = [
  { key: "negociacion", label: "Negociación" },
  { key: "oferta", label: "Oferta" },
  { key: "cierre", label: "Cierre" },
  { key: "finalizada", label: "Finalizada" },
];

export function nombreContraparte(d: DealRoomDetail) {
  const n = d.contraparte.empresa || d.contraparte.nombre;
  if (n) return n;
  return d.rol === "fondeador" ? "la PyME" : "el fondeador";
}

function aQuien(d: DealRoomDetail) {
  return d.rol === "fondeador" ? "a la PyME" : "al fondeador";
}

export function franjaDeTurno(d: DealRoomDetail): Franja | null {
  const t = d.turno;
  const moneda = d.invoice.moneda;
  const cp = nombreContraparte(d);

  if (d.rol === "admin") {
    return { tono: "info", titulo: "Estás viendo esta negociación como admin.", texto: "Solo lectura.", accion: null };
  }

  switch (t.accion) {
    case "responder_oferta": {
      const oferta = d.ofertas.find((o) => o.id === t.offer_id);
      const padre = oferta?.parent_offer_id ? d.ofertas.find((o) => o.id === oferta.parent_offer_id) : null;
      const esContraoferta = !!padre && padre.autor_rol !== oferta?.autor_rol;
      if (t.actor === d.rol) {
        return {
          tono: "accion",
          titulo: "Ahora te toca a vos.",
          texto:
            `${cp} te hizo una ${esContraoferta ? "contraoferta" : "oferta"} de ${formatMonto(t.monto, moneda)}.` +
            (t.expira_at ? ` Vence el ${formatFechaHora(t.expira_at)}.` : ""),
          accion: { tipo: "responder_oferta", offerId: t.offer_id, monto: t.monto, esContraoferta },
        };
      }
      return {
        tono: "espera",
        titulo: `Estamos esperando ${aQuien(d)}.`,
        texto: `Tu ${esContraoferta ? "contraoferta" : "oferta"} de ${formatMonto(t.monto, moneda)} está esperando respuesta.`,
        accion: null,
      };
    }

    case "pagar_comision":
    case "reintentar_comision": {
      if (d.rol === "fondeador") {
        const monto =
          t.monto_cobro != null && t.moneda_cobro
            ? formatMonto(t.monto_cobro, t.moneda_cobro)
            : t.monto_usd != null
              ? `${formatMonto(t.monto_usd, "USD")} (se paga en guaraníes)`
              : "la comisión";
        return {
          tono: "accion",
          titulo: t.accion === "reintentar_comision" ? "El pago no pudo completarse." : "Falta un último paso.",
          texto:
            (t.accion === "reintentar_comision"
              ? "Podés intentarlo de nuevo. "
              : "La oferta fue aceptada. Pagá la comisión de ViaFactoring para ver el contacto de la PyME. ") +
            `Comisión: ${monto}.` +
            (t.vence_at ? ` Tenés tiempo hasta el ${formatFecha(t.vence_at)}.` : ""),
          accion: { tipo: "pagar_comision", reintento: t.accion === "reintentar_comision" },
        };
      }
      return {
        tono: "espera",
        titulo: "Oferta aceptada. Estamos esperando al fondeador.",
        texto: "Cuando pague la comisión de ViaFactoring vas a ver su contacto para coordinar la transferencia.",
        accion: null,
      };
    }

    case "esperando_pago":
      return {
        tono: "espera",
        titulo: "Estamos esperando la confirmación del pago.",
        texto: d.rol === "fondeador" ? "Se actualiza sola en cuanto la pasarela lo confirme." : null,
        accion: null,
        refrescar: true,
      };

    case "desembolso": {
      if (d.rol === "fondeador") {
        if (!t.enviado) {
          return {
            tono: "accion",
            titulo: "Coordiná la transferencia.",
            texto: "Transferí el anticipo directo a la PyME, fuera de ViaFactoring, y avisá acá cuando lo hagas.",
            accion: { tipo: "declarar", offerId: t.offer_id, lado: "envio" },
          };
        }
        return { tono: "espera", titulo: "Estamos esperando a la PyME.", texto: "Tiene que confirmar que recibió los fondos.", accion: null };
      }
      if (!t.recibido) {
        return {
          tono: "accion",
          titulo: "¿Ya recibiste los fondos?",
          texto: t.enviado
            ? "El fondeador indicó que te transfirió. Confirmalo cuando te llegue."
            : "Cuando te llegue la transferencia del fondeador, confirmalo acá.",
          accion: { tipo: "declarar", offerId: t.offer_id, lado: "recepcion" },
        };
      }
      return { tono: "espera", titulo: "Estamos esperando al fondeador.", texto: "Tiene que indicar que envió los fondos.", accion: null };
    }

    case "finalizada":
      return { tono: "info", titulo: "Operación finalizada.", texto: null, accion: null };

    case "cerrada":
      return { tono: "info", titulo: "Esta negociación está cerrada.", texto: null, accion: null };

    default:
      return null;
  }
}

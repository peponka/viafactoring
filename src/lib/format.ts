export function formatMonto(monto: number, moneda: string) {
  return `${moneda} ${new Intl.NumberFormat("es-PY", {
    maximumFractionDigits: 0,
  }).format(monto)}`;
}

export function formatFecha(fecha: string | null) {
  if (!fecha) return "—";
  return new Intl.DateTimeFormat("es-PY", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(fecha));
}

export const RIESGO_LABEL: Record<string, string> = {
  bajo: "Riesgo bajo",
  medio: "Riesgo medio",
  alto: "Riesgo alto",
};

export const RUBRO_LABEL: Record<string, string> = {
  fluvial: "Fluvial",
  camiones: "Camiones",
};

// Muchos rubros ahora son texto libre cargado por el operador, así que no
// todos están en RUBRO_LABEL. Si no hay traducción, mostramos el valor tal
// cual lo escribieron.
export function rubroLabel(rubro: string) {
  return RUBRO_LABEL[rubro] ?? rubro;
}

export const ESTADO_FACTURA_LABEL: Record<string, string> = {
  disponible: "Disponible",
  cerrada: "Cerrada",
  retirada: "Retirada",
};

export const ESTADO_OFERTA_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  aceptada: "Aceptada",
  rechazada: "Rechazada",
};

export const TIPO_PAGO_LABEL: Record<string, string> = {
  creditos: "Compra de créditos",
  comision: "Comisión de cierre",
  desbloqueo: "Desbloqueo de operación",
};

export const ESTADO_DEAL_ROOM_LABEL: Record<string, string> = {
  open: "Abierto",
  negotiating: "En negociación",
  offer_accepted: "Oferta aceptada",
  closing: "Formalizando",
  closed: "Cerrado",
  cancelled: "Cancelado",
};

export function estadoDealRoomTone(estado: string) {
  if (estado === "closed") return "good" as const;
  if (estado === "cancelled") return "neutral" as const;
  if (estado === "offer_accepted" || estado === "closing") return "gold" as const;
  return "warn" as const;
}

export const NIVEL_LABEL: Record<number, string> = {
  1: "Público",
  2: "Desbloqueado",
  3: "Negociación",
  4: "Cierre",
};

export function formatFechaHora(fecha: string | null) {
  if (!fecha) return "—";
  return new Intl.DateTimeFormat("es-PY", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(fecha));
}

// Descuento implícito de una oferta: lo que el fondeador "se queda" por
// adelantar el cobro. Es un cálculo aritmético para comparar ofertas con la
// misma vara, no una tasa de mercado.
export function descuentoImplicito(
  montoFactura: number,
  anticipo: number,
  fechaVencimiento: string | null,
  plazoDias: number,
) {
  if (!montoFactura || montoFactura <= 0) return null;
  const descuento = (montoFactura - anticipo) / montoFactura;
  let dias = plazoDias;
  if (fechaVencimiento) {
    const ms = new Date(fechaVencimiento).getTime() - Date.now();
    const d = Math.ceil(ms / 86_400_000);
    if (d > 0) dias = d;
  }
  const anual = dias > 0 ? (descuento * 365) / dias : null;
  return { descuento, anual, dias };
}

export function formatPct(x: number | null | undefined) {
  if (x === null || x === undefined || !Number.isFinite(x)) return "—";
  return `${new Intl.NumberFormat("es-PY", { maximumFractionDigits: 1 }).format(x * 100)}%`;
}

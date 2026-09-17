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

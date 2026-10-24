import { descuentoImplicito, formatFecha, formatMonto, formatPct } from "@/lib/format";

// Explica una oferta en lenguaje simple, con las cuentas hechas. Es
// aritmética sobre los datos de la oferta, no una opinión: no dice si
// conviene o no.
export function explicarOferta(o: {
  montoFactura: number;
  anticipo: number;
  moneda: string;
  vencimiento: string | null;
  plazoDias: number;
  conRecurso: boolean | null;
  notificaDeudor: boolean | null;
  fechaPago: string | null;
}) {
  const calc = descuentoImplicito(o.montoFactura, o.anticipo, o.vencimiento, o.plazoDias);
  const ganancia = Math.max(0, o.montoFactura - o.anticipo);
  const pct = o.montoFactura > 0 ? o.anticipo / o.montoFactura : null;
  const frases: string[] = [];

  frases.push(
    `Te adelanta ${formatMonto(o.anticipo, o.moneda)}${pct != null ? ` (el ${formatPct(pct)} de la factura)` : ""}` +
      (o.fechaPago ? `, con pago previsto el ${formatFecha(o.fechaPago)}.` : "."),
  );
  frases.push(
    `Cuando el deudor pague${o.vencimiento ? ` el ${formatFecha(o.vencimiento)}` : ""}, el fondeador cobra los ${formatMonto(
      o.montoFactura,
      o.moneda,
    )}: se queda con ${formatMonto(ganancia, o.moneda)} por adelantarte la plata${calc?.dias ? ` ${calc.dias} días` : ""}.`,
  );
  if (o.conRecurso === true) frases.push("Con recurso: si el deudor no paga, vos tenés que devolverle el anticipo al fondeador.");
  if (o.conRecurso === false) frases.push("Sin recurso: si el deudor no paga, el riesgo lo asume el fondeador.");
  if (o.notificaDeudor === true) frases.push("Se le avisa al deudor que la factura ahora se le paga al fondeador.");
  if (o.notificaDeudor === false) frases.push("No se le avisa al deudor.");

  return { frases, ganancia, anual: calc?.anual ?? null, descuento: calc?.descuento ?? null };
}

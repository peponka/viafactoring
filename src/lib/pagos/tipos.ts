// Contrato que cumple cualquier pasarela. El resto de ViaFactoring solo
// conoce estas cuatro operaciones: cambiar de pasarela es escribir otro
// adaptador, sin tocar el Deal Room, las ofertas ni la base de datos.
//
// Estas pasarelas cobran únicamente las tarifas de ViaFactoring
// (desbloqueo y comisión). El anticipo del factoring nunca pasa por acá.

export type EstadoPasarela = "procesando" | "confirmado" | "fallido" | "rechazado" | "vencido";

export type OrdenNueva = {
  requestId: string;
  monto: number; // importe congelado en la orden (monto_cobro)
  moneda: string; // moneda_cobro (PYG)
  descripcion: string;
  venceAt: string;
  urlRetorno: string;
  comprador: { nombre: string; email: string | null };
};

export type WebhookVerificado = {
  valido: boolean;
  dedupeKey: string;
  providerRef: string | null;
  estado: EstadoPasarela | null;
  monto: number | null;
  moneda: string | null;
  payload: Record<string, unknown>;
  // Cuerpo que la pasarela espera como respuesta (si pide uno en particular)
  respuesta?: unknown;
};

export type EstadoConsultado = {
  estado: EstadoPasarela;
  monto: number | null;
  moneda: string | null;
};

export interface PaymentProvider {
  nombre: string;
  crearOrden(orden: OrdenNueva): Promise<{ providerRef: string; checkoutUrl: string }>;
  verificarWebhook(rawBody: string, headers: Headers): Promise<WebhookVerificado>;
  consultarEstado(providerRef: string): Promise<EstadoConsultado | null>;
  devolver(providerRef: string, monto: number): Promise<{ ok: boolean; detalle: string }>;
}

import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createServiceRoleClient } from "@/lib/supabase/server";
import type { EstadoConsultado, EstadoPasarela, PaymentProvider, WebhookVerificado } from "./tipos";
import { siteUrl } from "./sitio";

// Pasarela simulada para probar el flujo completo sin cobrar. Firma sus
// avisos con HMAC-SHA256 (PAYMENT_MOCK_SECRET), igual que haría una real,
// y pasa por exactamente el mismo webhook y las mismas validaciones.
// NO usar con usuarios reales: cualquiera podría "pagar" sin pagar.

function secreto() {
  const s = process.env.PAYMENT_MOCK_SECRET;
  if (!s || s.length < 16) throw new Error("PAYMENT_MOCK_SECRET no configurado");
  return s;
}

export function firmarMock(body: string) {
  return createHmac("sha256", secreto()).update(body).digest("hex");
}

export const mockProvider: PaymentProvider = {
  nombre: "mock",

  async crearOrden(orden) {
    const providerRef = `MOCK-${randomUUID()}`;
    const url = new URL(`/pagos/mock/${providerRef}`, siteUrl());
    url.searchParams.set("volver", orden.urlRetorno);
    return { providerRef, checkoutUrl: url.toString() };
  },

  async verificarWebhook(rawBody, headers): Promise<WebhookVerificado> {
    const firma = headers.get("x-mock-signature") ?? "";
    const esperada = firmarMock(rawBody);
    const valido =
      firma.length === esperada.length && timingSafeEqual(Buffer.from(firma), Buffer.from(esperada));
    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(rawBody);
    } catch {
      return { valido: false, dedupeKey: `invalido-${randomUUID()}`, providerRef: null, estado: null, monto: null, moneda: null, payload: {} };
    }
    return {
      valido,
      dedupeKey: String(body.evento ?? randomUUID()),
      providerRef: typeof body.ref === "string" ? body.ref : null,
      estado: (body.estado as EstadoPasarela) ?? null,
      monto: typeof body.monto === "number" ? body.monto : null,
      moneda: typeof body.moneda === "string" ? body.moneda : null,
      payload: body,
    };
  },

  // La "pasarela" simulada recuerda el último aviso válido que emitió.
  async consultarEstado(providerRef): Promise<EstadoConsultado | null> {
    const admin = createServiceRoleClient();
    const { data } = await admin
      .from("payment_events")
      .select("estado_informado, monto, moneda")
      .eq("provider", "mock")
      .eq("provider_ref", providerRef)
      .eq("firma_valida", true)
      .order("recibido_at", { ascending: false })
      .limit(1)
      .maybeSingle<{ estado_informado: string; monto: number; moneda: string }>();
    if (!data) return null;
    return { estado: data.estado_informado as EstadoPasarela, monto: Number(data.monto), moneda: data.moneda };
  },

  async devolver() {
    return { ok: true, detalle: "Devolución simulada (pasarela de prueba)" };
  },
};

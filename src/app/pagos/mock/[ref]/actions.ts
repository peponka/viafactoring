"use server";

import { randomUUID } from "node:crypto";
import { redirect } from "next/navigation";
import { firmarMock } from "@/lib/pagos/mock";
import { procesarWebhook } from "@/lib/pagos/servicio";
import { createServiceRoleClient } from "@/lib/supabase/server";

// La "pasarela" de prueba avisa a ViaFactoring exactamente como lo haría
// una real: un aviso firmado que pasa por el mismo procesarWebhook.
export async function simularPagoAction(formData: FormData) {
  if (process.env.PAYMENT_PROVIDER !== "mock") redirect("/");
  const ref = String(formData.get("ref") || "");
  const estado = String(formData.get("estado") || "");
  const volver = String(formData.get("volver") || "/");
  if (!["confirmado", "rechazado", "procesando"].includes(estado)) redirect(volver);

  const admin = createServiceRoleClient();
  const { data: orden } = await admin
    .from("payment_requests")
    .select("monto_cobro, moneda_cobro")
    .eq("provider", "mock")
    .eq("provider_ref", ref)
    .single<{ monto_cobro: number; moneda_cobro: string }>();
  if (!orden) redirect(volver);

  const body = JSON.stringify({
    evento: randomUUID(),
    ref,
    estado,
    monto: Number(orden.monto_cobro),
    moneda: orden.moneda_cobro,
  });
  const headers = new Headers({ "x-mock-signature": firmarMock(body) });
  await procesarWebhook("mock", body, headers);

  const destino = new URL(volver);
  redirect(destino.pathname + destino.search);
}

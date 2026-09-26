"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { iniciarPago, type ResultadoInicio } from "@/lib/pagos/servicio";

// Legacy (modelo de créditos). reveal_invoice ahora devuelve la info por niveles.
export type ActionResult = { error?: string; invoice?: unknown };

async function requireFondeador() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();
  if (profile?.role !== "fondeador") redirect("/");

  return { supabase, userId: user!.id };
}

// Gasta 1 crédito (o no cobra nada si ya estaba revelada antes) y devuelve
// el detalle completo de la factura.
export async function revelarFacturaAction(
  invoiceId: string,
): Promise<ActionResult> {
  const { supabase } = await requireFondeador();

  const { data, error } = await supabase.rpc("reveal_invoice", {
    p_invoice_id: invoiceId,
  });

  if (error) {
    return { error: error.message };
  }

  revalidatePath("/fondeador");
  revalidatePath(`/fondeador/facturas/${invoiceId}`);
  return { invoice: data ?? undefined };
}

// Inicia el pago del desbloqueo. El monto (tramo en USD → guaraníes) lo
// calcula la base; el Deal Room se abre solo cuando la pasarela confirma el
// pago por webhook, nunca porque el usuario vuelva de la pasarela.
export async function desbloquearAction(invoiceId: string): Promise<ResultadoInicio> {
  await requireFondeador();
  const r = await iniciarPago("desbloqueo", invoiceId);
  revalidatePath(`/fondeador/facturas/${invoiceId}`);
  return r;
}

// Los documentos se sirven por /api/documentos/[id] (con marca de agua y
// registro de cada descarga) y las ofertas se hacen desde el Deal Room.

export async function solicitarPackAction(
  _prev: { error: string | null; ok?: boolean },
  formData: FormData,
): Promise<{ error: string | null; ok?: boolean }> {
  const { supabase, userId } = await requireFondeador();
  const packId = String(formData.get("pack_id") || "");

  const { data: pack } = await supabase
    .from("credit_packs")
    .select("*")
    .eq("id", packId)
    .single();

  if (!pack) return { error: "Pack no encontrado." };

  const { error } = await supabase.from("payment_requests").insert({
    fondeador_id: userId,
    pack_id: pack.id,
    monto: pack.precio,
    moneda: pack.moneda,
  });

  if (error) return { error: error.message };

  revalidatePath("/fondeador/creditos");
  return { error: null, ok: true };
}

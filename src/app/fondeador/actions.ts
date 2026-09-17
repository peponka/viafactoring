"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import type { Invoice } from "@/lib/database.types";

export type ActionResult = { error?: string; invoice?: Invoice };

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

// Crea (o recupera, si ya existe una pendiente) la solicitud de pago para
// desbloquear el expediente completo de una operación. El monto lo calcula
// el RPC server-side (tabla escalonada por monto de la factura) — el
// cliente nunca decide cuánto paga.
export async function solicitarDesbloqueoAction(
  invoiceId: string,
): Promise<{ error: string | null }> {
  const { supabase } = await requireFondeador();

  const { error } = await supabase.rpc("solicitar_desbloqueo", {
    p_invoice_id: invoiceId,
  });

  if (error) return { error: error.message };

  revalidatePath("/fondeador");
  revalidatePath(`/fondeador/facturas/${invoiceId}`);
  return { error: null };
}

// Genera una signed URL de corta duración para el documento de una
// factura, solo si el fondeador ya la reveló (chequeado acá, server-side,
// antes de tocar el service role).
export async function getDocumentoUrlAction(
  invoiceId: string,
): Promise<{ url: string | null }> {
  const { supabase, userId } = await requireFondeador();

  const { data: reveal } = await supabase
    .from("reveals")
    .select("id")
    .eq("invoice_id", invoiceId)
    .eq("fondeador_id", userId)
    .maybeSingle();

  if (!reveal) return { url: null };

  const { data: invoice } = await supabase
    .from("invoices")
    .select("documento_url")
    .eq("id", invoiceId)
    .maybeSingle();

  if (!invoice?.documento_url) return { url: null };

  const admin = createServiceRoleClient();
  const { data: signed } = await admin.storage
    .from("facturas")
    .createSignedUrl(invoice.documento_url, 60 * 10);

  return { url: signed?.signedUrl ?? null };
}

export async function marcarContactadoAction(invoiceId: string) {
  const { supabase, userId } = await requireFondeador();
  await supabase
    .from("reveals")
    .update({ contactado: true })
    .eq("invoice_id", invoiceId)
    .eq("fondeador_id", userId);
  revalidatePath(`/fondeador/facturas/${invoiceId}`);
}

// Crea o actualiza la oferta del fondeador sobre una factura ya destrabada.
// Si el operador ya la aceptó, el RPC rechaza el cambio.
export async function hacerOfertaAction(
  _prev: { error: string | null; ok?: boolean },
  formData: FormData,
): Promise<{ error: string | null; ok?: boolean }> {
  const { supabase } = await requireFondeador();
  const invoiceId = String(formData.get("invoice_id") || "");
  const monto = Number(formData.get("monto_ofrecido"));
  const mensaje = String(formData.get("mensaje") || "").trim() || null;

  if (!invoiceId) return { error: "Falta la factura." };
  if (!Number.isFinite(monto) || monto <= 0) {
    return { error: "El monto ofrecido tiene que ser un número mayor a 0." };
  }

  const { error } = await supabase.rpc("create_offer", {
    p_invoice_id: invoiceId,
    p_monto_ofrecido: monto,
    p_mensaje: mensaje,
  });

  if (error) return { error: error.message };

  revalidatePath(`/fondeador/facturas/${invoiceId}`);
  return { error: null, ok: true };
}

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

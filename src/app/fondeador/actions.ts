"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

// ---------------------------------------------------------------------------
// Categoría, verificación y preferencias (0014)
// ---------------------------------------------------------------------------

function mensajeDeError(message: string | undefined, fallback: string) {
  if (!message) return fallback;
  // Los errores de las funciones de la base ya vienen en castellano y
  // pensados para mostrarse; los técnicos se reemplazan por uno genérico.
  if (/permission denied|violates|syntax|function .* does not exist/i.test(message)) return fallback;
  return message;
}

export async function enviarVerificacionAction(
  categoria: "individual" | "institucion",
  documentos: string[],
): Promise<{ error: string | null }> {
  const { supabase } = await requireFondeador();
  const { error } = await supabase.rpc("enviar_verificacion", {
    p_categoria: categoria,
    p_documentos: documentos,
  });
  if (error) return { error: mensajeDeError(error.message, "No pudimos enviar tu documentación. Probá de nuevo.") };
  revalidatePath("/fondeador", "layout");
  return { error: null };
}

export async function guardarPreferenciasAction(
  _prev: { error: string | null; ok?: boolean },
  formData: FormData,
): Promise<{ error: string | null; ok?: boolean }> {
  const { supabase } = await requireFondeador();
  const num = (k: string) => {
    const v = String(formData.get(k) ?? "").replace(/[^\d]/g, "");
    return v ? Number(v) : null;
  };
  const min = num("monto_min_usd");
  if (min == null) return { error: "Indicá desde qué monto querés ver facturas." };

  const { error } = await supabase.rpc("guardar_preferencias", {
    p_monto_min_usd: min,
    p_monto_max_usd: num("monto_max_usd"),
    p_plazo_max_dias: num("plazo_max_dias"),
    p_riesgos: formData.getAll("riesgos").map(String) as ("bajo" | "medio" | "alto")[],
    p_deudor_tipos: formData.getAll("deudor_tipos").map(String) as ("privado" | "estado")[],
    p_industrias: formData.getAll("industrias").map(String),
    p_alertas: formData.get("alertas") === "on",
  });
  if (error) return { error: mensajeDeError(error.message, "No pudimos guardar tus preferencias.") };
  revalidatePath("/fondeador");
  if (formData.get("volver") === "feed") redirect("/fondeador");
  return { error: null, ok: true };
}

// ---------------------------------------------------------------------------
// Feed: «Paso» y «Me interesa»
// ---------------------------------------------------------------------------

export async function pasarFacturaAction(invoiceId: string): Promise<{ error: string | null }> {
  const { supabase, userId } = await requireFondeador();
  const { error } = await supabase
    .from("invoice_pasadas")
    .upsert({ fondeador_id: userId, invoice_id: invoiceId }, { onConflict: "fondeador_id,invoice_id" });
  return { error: error ? "No se pudo guardar. Probá de nuevo." : null };
}

export async function deshacerPasoAction(invoiceId: string): Promise<{ error: string | null }> {
  const { supabase, userId } = await requireFondeador();
  await supabase.from("invoice_pasadas").delete().eq("fondeador_id", userId).eq("invoice_id", invoiceId);
  return { error: null };
}

export async function restaurarPasadasAction(): Promise<{ error: string | null }> {
  const { supabase, userId } = await requireFondeador();
  const { error } = await supabase.from("invoice_pasadas").delete().eq("fondeador_id", userId);
  revalidatePath("/fondeador");
  return { error: error ? "No pudimos recuperar las facturas. Probá de nuevo." : null };
}

export async function marcarInteresAction(
  invoiceId: string,
): Promise<{ error: string | null; dealRoomId?: string }> {
  const { supabase } = await requireFondeador();
  const { data, error } = await supabase.rpc("marcar_interes", { p_invoice_id: invoiceId });
  if (error || !data) {
    return { error: mensajeDeError(error?.message, "No pudimos abrir la negociación. Probá de nuevo.") };
  }
  revalidatePath("/fondeador/deal-rooms");
  return { error: null, dealRoomId: data };
}

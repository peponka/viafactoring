"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function requireAdmin() {
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
  if (profile?.role !== "admin") redirect("/");

  return { supabase };
}

export async function confirmarPagoAction(requestId: string, paymentLink?: string) {
  const { supabase } = await requireAdmin();

  if (paymentLink) {
    await supabase
      .from("payment_requests")
      .update({ payment_link: paymentLink })
      .eq("id", requestId);
  }

  const { error } = await supabase.rpc("confirm_payment_request", {
    p_request_id: requestId,
  });

  revalidatePath("/admin/pagos");
  revalidatePath("/admin/fondeadores");
  return { error: error?.message ?? null };
}

export async function cancelarPagoAction(requestId: string) {
  const { supabase } = await requireAdmin();
  await supabase
    .from("payment_requests")
    .update({ estado: "cancelado" })
    .eq("id", requestId);
  revalidatePath("/admin/pagos");
}

export async function guardarLinkPagoAction(requestId: string, paymentLink: string) {
  const { supabase } = await requireAdmin();
  await supabase
    .from("payment_requests")
    .update({ payment_link: paymentLink })
    .eq("id", requestId);
  revalidatePath("/admin/pagos");
}

export async function ajustarCreditoAction(
  fondeadorId: string,
  cantidad: number,
  nota: string,
) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("admin_adjust_credit", {
    p_fondeador_id: fondeadorId,
    p_cantidad: cantidad,
    p_nota: nota || null,
  });
  revalidatePath("/admin/fondeadores");
  return { error: error?.message ?? null };
}

export async function crearPackAction(formData: FormData) {
  const { supabase } = await requireAdmin();
  const nombre = String(formData.get("nombre") || "").trim();
  const cantidad_creditos = Number(formData.get("cantidad_creditos"));
  const precio = Number(formData.get("precio"));
  const moneda = String(formData.get("moneda") || "USD");

  if (!nombre || !cantidad_creditos || !Number.isFinite(precio)) return;

  await supabase.from("credit_packs").insert({
    nombre,
    cantidad_creditos,
    precio,
    moneda,
  });
  revalidatePath("/admin/packs");
}

export async function togglePackAction(packId: string, activo: boolean) {
  const { supabase } = await requireAdmin();
  await supabase.from("credit_packs").update({ activo }).eq("id", packId);
  revalidatePath("/admin/packs");
}

export async function cerrarFacturaAction(invoiceId: string) {
  const { supabase } = await requireAdmin();
  await supabase.from("invoices").update({ estado: "cerrada" }).eq("id", invoiceId);
  revalidatePath("/admin/facturas");
}

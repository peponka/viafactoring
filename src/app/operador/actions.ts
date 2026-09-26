"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Riesgo } from "@/lib/database.types";

export type FormState = { error: string | null };

async function requireOperador() {
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
  if (profile?.role !== "operador") redirect("/");

  return { supabase, userId: user!.id };
}

export async function crearFacturaAction(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const { supabase, userId } = await requireOperador();

  const monto = Number(formData.get("monto"));
  const plazo_dias = Number(formData.get("plazo_dias"));
  const deudor_nombre = String(formData.get("deudor_nombre") || "").trim();
  const rubro = String(formData.get("rubro") || "");

  if (!deudor_nombre) return { error: "Falta el nombre del deudor." };
  if (!Number.isFinite(monto) || monto <= 0)
    return { error: "El monto tiene que ser un número mayor a 0." };
  if (!Number.isFinite(plazo_dias) || plazo_dias < 0)
    return { error: "El plazo en días no es válido." };
  if (!rubro.trim()) return { error: "Elegí o escribí el rubro." };

  const { data: invoice, error } = await supabase
    .from("invoices")
    .insert({
      operador_id: userId,
      numero: String(formData.get("numero") || "") || null,
      rubro,
      deudor_nombre,
      deudor_contacto: String(formData.get("deudor_contacto") || "") || null,
      monto,
      moneda: String(formData.get("moneda") || "USD"),
      plazo_dias,
      fecha_vencimiento: String(formData.get("fecha_vencimiento") || "") || null,
      riesgo: (String(formData.get("riesgo") || "medio")) as Riesgo,
      descripcion: String(formData.get("descripcion") || "") || null,
      operador_contacto: String(formData.get("operador_contacto") || "") || null,
    })
    .select()
    .single();

  if (error || !invoice) {
    return { error: error?.message || "No se pudo guardar la factura." };
  }

  const documento = formData.get("documento");
  if (documento instanceof File && documento.size > 0) {
    const path = `${userId}/${invoice.id}/${documento.name}`;
    const { error: uploadError } = await supabase.storage
      .from("facturas")
      .upload(path, documento, { upsert: true });

    if (!uploadError) {
      await supabase
        .from("invoices")
        .update({ documento_url: path })
        .eq("id", invoice.id);
    }
  }

  revalidatePath("/operador");
  redirect("/operador");
}

export async function retirarFacturaAction(invoiceId: string) {
  const { supabase } = await requireOperador();
  await supabase
    .from("invoices")
    .update({ estado: "retirada" })
    .eq("id", invoiceId);
  revalidatePath("/operador");
}

// El cierre de una factura ocurre al aceptar una oferta en su Deal Room
// (ver src/app/deal-room/actions.ts). El viejo "Marcar como cerrada" por
// autoreporte se retiró: cerraba sin cobrar la comisión de cierre.

"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { pasarelaPorNombre } from "@/lib/pagos";

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

// Excepciones: lo único que el admin toca del flujo de pagos. Cada acción
// exige un motivo y queda en audit_logs (lo registra la base).

export async function resolverExcepcionAction(
  id: string,
  estado: "resuelta" | "descartada",
  resolucion: string,
) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("admin_resolver_excepcion", {
    p_id: id,
    p_estado: estado,
    p_resolucion: resolucion,
  });
  revalidatePath("/admin/excepciones");
  revalidatePath("/admin");
  return { error: error?.message ?? null };
}

// Para cuando la pasarela cobró y el aviso no llegó: se verifica el estado
// consultando a la pasarela desde el servidor antes de aplicar nada.
export async function aplicarPagoVerificadoAction(exceptionId: string, motivo: string) {
  const { supabase } = await requireAdmin();
  const { data: exc } = await supabase
    .from("exceptions")
    .select("payment_request_id")
    .eq("id", exceptionId)
    .single();
  if (!exc?.payment_request_id) return { error: "Esta excepción no tiene un pago asociado." };

  const { data: req } = await supabase
    .from("payment_requests")
    .select("provider, provider_ref")
    .eq("id", exc.payment_request_id)
    .single();
  const pasarela = req?.provider ? pasarelaPorNombre(req.provider) : null;
  if (pasarela && req?.provider_ref) {
    const consulta = await pasarela.consultarEstado(req.provider_ref).catch(() => null);
    if (consulta && consulta.estado !== "confirmado") {
      return { error: `La pasarela informa que el pago está "${consulta.estado}". No se aplicó.` };
    }
  }

  const { error } = await supabase.rpc("admin_aplicar_pago_verificado", {
    p_exception_id: exceptionId,
    p_motivo: motivo,
  });
  revalidatePath("/admin/excepciones");
  revalidatePath("/admin");
  return { error: error?.message ?? null };
}

// Devolución: se pide a la pasarela desde el servidor y recién después se
// marca el pago como devuelto.
export async function devolverPagoAction(exceptionId: string, motivo: string) {
  const { supabase } = await requireAdmin();
  const { data: exc } = await supabase
    .from("exceptions")
    .select("payment_request_id")
    .eq("id", exceptionId)
    .single();
  if (!exc?.payment_request_id) return { error: "Esta excepción no tiene un pago asociado." };
  const { data: req } = await supabase
    .from("payment_requests")
    .select("provider, provider_ref, monto_cobro, monto")
    .eq("id", exc.payment_request_id)
    .single();
  const pasarela = req?.provider ? pasarelaPorNombre(req.provider) : null;
  if (!pasarela || !req?.provider_ref) {
    return { error: "No hay una pasarela activa para ese pago. Hacé la devolución desde su portal y descartá la excepción con el detalle." };
  }
  const dev = await pasarela.devolver(req.provider_ref, Number(req.monto_cobro ?? req.monto));
  if (!dev.ok) {
    return { error: `La pasarela no aceptó la devolución (${dev.detalle}). Hacela desde su portal.` };
  }
  const { error } = await supabase.rpc("admin_marcar_devuelto", {
    p_exception_id: exceptionId,
    p_motivo: motivo,
  });
  revalidatePath("/admin/excepciones");
  return { error: error?.message ?? null };
}

// Carga manual del tipo de cambio (solo si el BCP no respondió).
export async function cargarTipoCambioAction(fecha: string, pyg: number) {
  const { supabase } = await requireAdmin();
  const { error } = await supabase.rpc("guardar_tipo_cambio", {
    p_fecha: fecha,
    p_pyg: pyg,
    p_fuente: "manual_admin",
  });
  revalidatePath("/admin/excepciones");
  return { error: error?.message ?? null };
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

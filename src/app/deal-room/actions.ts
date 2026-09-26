"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { after } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { iniciarPago, type ResultadoInicio } from "@/lib/pagos/servicio";
import { enviarEmailsPendientes } from "@/lib/notificaciones/email";

// Todas las acciones del Deal Room llaman a funciones de la base que
// verifican pertenencia con auth.uid(). Nada de lo que llega del navegador
// (IDs incluidos) se usa sin que la base confirme que el usuario es parte.

async function sesion() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user!.id };
}

function refrescar(revealId: string) {
  revalidatePath(`/deal-room/${revealId}`);
  revalidatePath("/fondeador");
  revalidatePath("/operador");
  // Los avisos importantes (ofertas, aceptación, desembolso) salen enseguida;
  // los mensajes de chat esperan unos minutos para agruparse.
  after(() => enviarEmailsPendientes());
}

export type Resultado = { error: string | null; ok?: boolean };

export async function enviarMensajeAction(
  revealId: string,
  cuerpo: string,
  tipo: "mensaje" | "pregunta" | "solicitud" | "respuesta",
  replyTo: string | null = null,
): Promise<Resultado> {
  const { supabase } = await sesion();
  const { error } = await supabase.rpc("send_message", {
    p_reveal_id: revealId,
    p_cuerpo: cuerpo,
    p_tipo: tipo,
    p_reply_to: replyTo,
  });
  refrescar(revealId);
  return { error: error?.message ?? null };
}

export async function marcarLeidosAction(revealId: string) {
  const { supabase } = await sesion();
  await supabase.rpc("marcar_leidos", { p_reveal_id: revealId });
  revalidatePath("/fondeador");
  revalidatePath("/operador");
}

export async function resolverSolicitudAction(revealId: string, messageId: string): Promise<Resultado> {
  const { supabase } = await sesion();
  const { error } = await supabase.rpc("resolver_solicitud", { p_message_id: messageId });
  refrescar(revealId);
  return { error: error?.message ?? null };
}

function siNo(v: FormDataEntryValue | null): boolean | null {
  if (v === "si") return true;
  if (v === "no") return false;
  return null;
}

// Oferta nueva del fondeador (sin offer_id) o contraoferta de quien recibió
// la oferta pendiente (con offer_id).
export async function ofertarAction(_prev: Resultado, formData: FormData): Promise<Resultado> {
  const { supabase } = await sesion();
  const revealId = String(formData.get("reveal_id") || "");
  const invoiceId = String(formData.get("invoice_id") || "");
  const offerId = String(formData.get("offer_id") || "");
  const monto = Number(formData.get("monto_ofrecido"));
  const mensaje = String(formData.get("mensaje") || "").trim() || null;
  const conRecurso = siNo(formData.get("con_recurso"));
  const notificaDeudor = siNo(formData.get("notifica_deudor"));
  const fecha = String(formData.get("fecha_pago_prevista") || "") || null;

  if (!Number.isFinite(monto) || monto <= 0) {
    return { error: "El anticipo tiene que ser un número mayor a 0." };
  }

  const { error } = offerId
    ? await supabase.rpc("counter_offer", {
        p_offer_id: offerId,
        p_monto_ofrecido: monto,
        p_mensaje: mensaje,
        p_con_recurso: conRecurso,
        p_notifica_deudor: notificaDeudor,
        p_fecha_pago_prevista: fecha,
      })
    : await supabase.rpc("create_offer", {
        p_invoice_id: invoiceId,
        p_monto_ofrecido: monto,
        p_mensaje: mensaje,
        p_con_recurso: conRecurso,
        p_notifica_deudor: notificaDeudor,
        p_fecha_pago_prevista: fecha,
      });

  refrescar(revealId);
  if (error) return { error: error.message };
  return { error: null, ok: true };
}

export async function responderOfertaAction(
  revealId: string,
  offerId: string,
  aceptar: boolean,
): Promise<Resultado> {
  const { supabase } = await sesion();
  const { error } = await supabase.rpc("respond_offer", {
    p_offer_id: offerId,
    p_accept: aceptar,
  });
  refrescar(revealId);
  return { error: error?.message ?? null };
}

export async function declararTransferenciaAction(
  revealId: string,
  offerId: string,
): Promise<Resultado> {
  const { supabase } = await sesion();
  const { error } = await supabase.rpc("declarar_transferencia", { p_offer_id: offerId });
  refrescar(revealId);
  return { error: error?.message ?? null };
}

export async function cancelarDealRoomAction(revealId: string, motivo: string): Promise<Resultado> {
  const { supabase } = await sesion();
  const { error } = await supabase.rpc("cancelar_deal_room", {
    p_reveal_id: revealId,
    p_motivo: motivo || null,
  });
  refrescar(revealId);
  return { error: error?.message ?? null };
}

const MIME_OK = ["application/pdf", "image/jpeg", "image/png"];
const MAX_BYTES = 10 * 1024 * 1024;

// Sube un documento al Deal Room. El archivo lo guarda el servidor (el
// fondeador no tiene permiso de escritura en Storage); el registro lo hace
// la base con la sesión del usuario, que vuelve a validar la pertenencia.
export async function subirDocumentoAction(_prev: Resultado, formData: FormData): Promise<Resultado> {
  const { supabase } = await sesion();
  const revealId = String(formData.get("reveal_id") || "");
  const tipo = String(formData.get("tipo") || "otro");
  const archivo = formData.get("archivo");

  if (!(archivo instanceof File) || archivo.size === 0) {
    return { error: "Elegí un archivo." };
  }
  if (!MIME_OK.includes(archivo.type)) {
    return { error: "Solo se aceptan PDF, JPG o PNG." };
  }
  if (archivo.size > MAX_BYTES) {
    return { error: "El archivo no puede pesar más de 10 MB." };
  }

  const { data: miembro } = await supabase.rpc("deal_room_rol", { p_reveal_id: revealId });
  if (miembro !== "fondeador" && miembro !== "operador") {
    return { error: "No sos parte de este Deal Room." };
  }

  const nombreSeguro = archivo.name.replace(/[^\w.\-]+/g, "_").slice(-120) || "documento";
  const ruta = `deal-rooms/${revealId}/${crypto.randomUUID()}-${nombreSeguro}`;

  const admin = createServiceRoleClient();
  const { error: uploadError } = await admin.storage
    .from("facturas")
    .upload(ruta, archivo, { contentType: archivo.type, upsert: false });
  if (uploadError) return { error: "No se pudo subir el archivo." };

  const { error } = await supabase.rpc("registrar_documento_deal_room", {
    p_reveal_id: revealId,
    p_storage_path: ruta,
    p_nombre: archivo.name,
    p_mime: archivo.type,
    p_tipo: tipo,
    p_nivel_minimo: 2,
  });

  if (error) {
    await admin.storage.from("facturas").remove([ruta]);
    return { error: error.message };
  }

  refrescar(revealId);
  return { error: null, ok: true };
}

// Pago de la comisión desde el Deal Room. El monto lo calcula la base.
export async function pagarComisionAction(revealId: string): Promise<ResultadoInicio> {
  await sesion();
  const r = await iniciarPago("comision", revealId);
  refrescar(revealId);
  return r;
}

export async function reportarProblemaAction(revealId: string, detalle: string): Promise<Resultado> {
  const { supabase } = await sesion();
  const { error } = await supabase.rpc("reportar_problema", { p_reveal_id: revealId, p_detalle: detalle });
  return { error: error?.message ?? null, ok: !error };
}

import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/pagos/sitio";

// Envío de los avisos por email. Proveedor configurable: hoy Resend por su
// API HTTP (RESEND_API_KEY + EMAIL_FROM). Sin configurar, los avisos se
// quedan dentro de la plataforma y no se pierde nada.
// BLOQUEO EXTERNO: requiere un dominio propio verificado para EMAIL_FROM.

function escapar(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

function html(n: { titulo: string; cuerpo: string | null; accion_label: string; url: string }) {
  const link = siteUrl() + n.url;
  return `<!doctype html><html><body style="font-family:Arial,sans-serif;background:#f6f7f9;padding:24px">
<div style="max-width:520px;margin:0 auto;background:#fff;border-radius:12px;padding:28px">
<p style="font-weight:bold;font-size:18px;margin:0 0 8px">${escapar(n.titulo)}</p>
${n.cuerpo ? `<p style="color:#555;margin:0 0 20px">${escapar(n.cuerpo)}</p>` : ""}
<a href="${link}" style="display:inline-block;background:#1f4fb3;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:bold">${escapar(n.accion_label)}</a>
<p style="color:#999;font-size:12px;margin-top:28px">ViaFactoring · Podés desactivar los avisos por email en ${escapar(siteUrl())}/notificaciones</p>
</div></body></html>`;
}

export function emailConfigurado() {
  return !!process.env.RESEND_API_KEY && !!process.env.EMAIL_FROM;
}

export async function enviarEmailsPendientes(limite = 50): Promise<{ enviados: number; errores: number; configurado: boolean }> {
  if (!emailConfigurado()) return { enviados: 0, errores: 0, configurado: false };
  const admin = createServiceRoleClient();
  const { data: pendientes } = await admin.rpc("notificaciones_para_email", { p_limite: limite });
  let enviados = 0;
  let errores = 0;
  for (const n of pendientes ?? []) {
    if (!n.email) {
      await admin.rpc("marcar_email_notificacion", { p_id: n.id, p_estado: "omitido" });
      continue;
    }
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM,
          to: n.email,
          subject: n.titulo,
          html: html(n),
        }),
      });
      await admin.rpc("marcar_email_notificacion", { p_id: n.id, p_estado: res.ok ? "enviado" : "error" });
      if (res.ok) enviados++;
      else errores++;
    } catch {
      await admin.rpc("marcar_email_notificacion", { p_id: n.id, p_estado: "error" });
      errores++;
    }
  }
  return { enviados, errores, configurado: true };
}

// WhatsApp: la tabla notifications ya guarda el estado del canal y cada
// usuario puede activarlo en sus preferencias. El envío se conecta cuando
// exista la cuenta de WhatsApp Business con plantillas aprobadas.
// BLOQUEO EXTERNO: cuenta de WhatsApp Business verificada por Meta.
export function whatsappConfigurado() {
  return false;
}

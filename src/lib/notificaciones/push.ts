import "server-only";
import webpush from "web-push";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { siteUrl } from "@/lib/pagos/sitio";

// Notificaciones push (Web Push, gratis): llegan al celular o la compu aunque
// la app esté cerrada. En iPhone solo funcionan con la app instalada.
// Claves VAPID: NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT.

export function pushConfigurado() {
  return !!process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && !!process.env.VAPID_PRIVATE_KEY;
}

type Suscripcion = { id: string; endpoint: string; p256dh: string; auth: string };

export async function enviarPushPendientes(limite = 50): Promise<{ enviados: number; errores: number }> {
  if (!pushConfigurado()) return { enviados: 0, errores: 0 };
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:contacto@viafactoring.com.py",
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );

  const admin = createServiceRoleClient();
  const { data: pendientes } = await admin.rpc("notificaciones_para_push", { p_limite: limite });
  let enviados = 0;
  let errores = 0;

  for (const n of pendientes ?? []) {
    const subs = (n.suscripciones ?? []) as Suscripcion[];
    if (subs.length === 0) {
      await admin.from("notifications").update({ push_estado: "omitido" }).eq("id", n.id);
      continue;
    }
    const carga = JSON.stringify({
      titulo: n.titulo,
      cuerpo: n.cuerpo ?? "",
      url: siteUrl() + n.url,
      tag: n.id,
    });
    let alguno = false;
    for (const s of subs) {
      try {
        await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, carga, {
          TTL: 60 * 60 * 24,
          urgency: "high",
        });
        alguno = true;
        await admin.from("push_subscriptions").update({ last_used_at: new Date().toISOString() }).eq("id", s.id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        // El dispositivo dio de baja la suscripción: se borra.
        if (status === 404 || status === 410) {
          await admin.from("push_subscriptions").delete().eq("id", s.id);
        } else {
          console.error("[push] envío falló", status);
        }
      }
    }
    await admin.from("notifications").update({ push_estado: alguno ? "enviado" : "error" }).eq("id", n.id);
    if (alguno) enviados++;
    else errores++;
  }
  return { enviados, errores };
}

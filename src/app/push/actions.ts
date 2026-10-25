"use server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

type Sub = { endpoint: string; keys: { p256dh: string; auth: string } };

// Guarda el dispositivo del usuario para mandarle avisos push. Si el mismo
// navegador estaba asociado a otra cuenta (se cambió de usuario), pasa a la
// cuenta actual.
export async function guardarSuscripcionPushAction(sub: Sub, userAgent: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Iniciá sesión de nuevo." };
  if (!sub?.endpoint?.startsWith("https://") || !sub.keys?.p256dh || !sub.keys?.auth) {
    return { error: "Suscripción no válida." };
  }
  const admin = createServiceRoleClient();
  const { error } = await admin.from("push_subscriptions").upsert(
    {
      user_id: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      user_agent: userAgent.slice(0, 300),
    },
    { onConflict: "endpoint" },
  );
  return { error: error ? "No pudimos activar los avisos." : null };
}

export async function quitarSuscripcionPushAction(endpoint: string) {
  const supabase = await createClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
}

import "server-only";
import { enviarEmailsPendientes } from "@/lib/notificaciones/email";
import { enviarPushPendientes } from "@/lib/notificaciones/push";

// Manda por todos los canales configurados los avisos que quedaron pendientes.
export async function despacharAvisos() {
  await Promise.allSettled([enviarPushPendientes(), enviarEmailsPendientes()]);
}

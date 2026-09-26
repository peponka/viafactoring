import { after } from "next/server";
import { procesarWebhook } from "@/lib/pagos/servicio";
import { enviarEmailsPendientes } from "@/lib/notificaciones/email";

// Aviso de la pasarela (servidor a servidor). Todo lo que decide el
// resultado se verifica en procesarWebhook; esta ruta solo lo recibe.
export async function POST(request: Request, ctx: RouteContext<"/api/pagos/webhook/[provider]">) {
  const { provider } = await ctx.params;
  const raw = await request.text();
  const r = await procesarWebhook(provider, raw, request.headers);
  if (r.status === 200) after(() => enviarEmailsPendientes());
  return Response.json(r.body, { status: r.status, headers: { "Cache-Control": "no-store" } });
}

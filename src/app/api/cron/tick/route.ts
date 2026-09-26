import { createServiceRoleClient } from "@/lib/supabase/server";
import { conciliarOrdenes } from "@/lib/pagos/servicio";
import { enviarEmailsPendientes } from "@/lib/notificaciones/email";
import { actualizarTipoCambio } from "@/lib/tipo-cambio";

// Proceso programado: cotización del día, vencimientos y recordatorios,
// conciliación de pagos sin aviso y envío de emails. Lo llaman Supabase
// (pg_cron cada 10 minutos, migración 0013) y Vercel Cron como respaldo.
// Protegido con CRON_SECRET.
export async function GET(request: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || request.headers.get("authorization") !== `Bearer ${secreto}`) {
    return Response.json({ error: "no autorizado" }, { status: 401 });
  }

  const admin = createServiceRoleClient();
  const tipoCambio = await actualizarTipoCambio();
  const { data: vencimientos, error } = await admin.rpc("vencer_y_recordar");
  const conciliadas = await conciliarOrdenes();
  const emails = await enviarEmailsPendientes(100);

  return Response.json(
    { tipoCambio, vencimientos, error: error?.message ?? null, conciliadas, emails },
    { headers: { "Cache-Control": "no-store" } },
  );
}

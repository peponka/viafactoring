import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { avisoDeudorPdf, contratoCesionPdf, type Parte } from "@/lib/contrato";
import type { DealRoomDetail, FichaVerificacion, Profile } from "@/lib/database.types";

// Modelos prellenados (contrato de cesión y aviso al deudor). Solo para las
// partes, y recién cuando se pagó la comisión: antes no hay datos de contacto
// que poner ni trato cerrado.
export async function GET(req: NextRequest, ctx: RouteContext<"/api/contrato/[id]">) {
  const { id } = await ctx.params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  const { data: detalle } = await supabase.rpc("get_deal_room_detail", { p_reveal_id: id });
  const d = detalle as DealRoomDetail | null;
  if (!d) return NextResponse.json({ error: "Negociación no encontrada" }, { status: 404 });
  if (d.nivel < 4 && d.rol !== "admin") {
    return NextResponse.json({ error: "El contrato se habilita cuando se paga la comisión de cierre." }, { status: 403 });
  }

  const oferta = d.ofertas.find((o) => o.estado === "aceptada");
  if (!oferta) return NextResponse.json({ error: "Todavía no hay una oferta aceptada." }, { status: 409 });

  const [{ data: yo }, { data: fichaData }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).single<Profile>(),
    supabase.rpc("ficha_verificacion", { p_reveal_id: id }),
  ]);
  const ficha = fichaData as FichaVerificacion | null;

  const mio: Parte = {
    nombre: yo?.nombre ?? "",
    empresa: yo?.empresa ?? null,
    ruc: null,
    email: yo?.email ?? user.email ?? null,
    telefono: yo?.telefono ?? null,
  };
  const otro: Parte = {
    nombre: d.contraparte.nombre ?? "",
    empresa: d.contraparte.empresa ?? null,
    ruc: null,
    email: d.contraparte.email ?? null,
    telefono: d.contraparte.telefono ?? null,
  };
  const cedente = d.rol === "operador" ? mio : otro;
  const cesionario = d.rol === "operador" ? otro : mio;
  cedente.ruc = ficha?.emisor_ruc ?? null;

  const datos = {
    cedente,
    cesionario,
    factura: {
      numero: d.invoice.numero ?? null,
      cdc: ficha?.cdc ?? null,
      deudorNombre: d.invoice.deudor_nombre ?? null,
      deudorRuc: ficha?.deudor_ruc ?? null,
      monto: d.invoice.monto,
      moneda: d.invoice.moneda,
      vencimiento: d.invoice.fecha_vencimiento ?? null,
    },
    oferta: {
      anticipo: oferta.monto_ofrecido,
      conRecurso: oferta.con_recurso,
      notificaDeudor: oferta.notifica_deudor,
      fechaPago: oferta.fecha_pago_prevista,
    },
    operacionId: d.reveal_id,
  };

  const esAviso = req.nextUrl.searchParams.get("doc") === "aviso";
  const pdf = esAviso ? await avisoDeudorPdf(datos) : await contratoCesionPdf(datos);
  const archivo = esAviso ? "aviso-de-cesion.pdf" : "contrato-de-cesion.pdf";

  return new NextResponse(pdf.slice(), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${archivo}"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

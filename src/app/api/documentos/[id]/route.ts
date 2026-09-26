import { NextResponse, type NextRequest } from "next/server";
import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { marcarDocumento, mimeDesdeNombre } from "@/lib/watermark";

// Única puerta de salida de documentos. Nunca se entrega una URL de
// Storage: cada descarga exige sesión, se verifica en la base, se registra
// en audit_logs y sale con marca de agua de quién la descargó.
export async function GET(_req: NextRequest, ctx: RouteContext<"/api/documentos/[id]">) {
  const { id } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "No autenticado" }, { status: 401 });

  // 1. Acceso: lo decide la base con la sesión del usuario
  const { data: puede, error: errAcceso } = await supabase.rpc("can_access_document", {
    p_document_id: id,
  });
  if (errAcceso || !puede) {
    return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
  }

  // 2. Datos del documento (la ruta en Storage solo la ve la service role)
  const admin = createServiceRoleClient();
  const { data: doc } = await admin
    .from("documents")
    .select("id, invoice_id, reveal_id, storage_path, nombre, mime")
    .eq("id", id)
    .single<{
      id: string;
      invoice_id: string;
      reveal_id: string | null;
      storage_path: string;
      nombre: string;
      mime: string | null;
    }>();
  if (!doc) return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });

  const [{ data: perfil }, { data: invoice }, { data: reveal }] = await Promise.all([
    admin.from("profiles").select("nombre, empresa").eq("id", user.id).single<{ nombre: string; empresa: string | null }>(),
    admin.from("invoices").select("operador_id").eq("id", doc.invoice_id).single<{ operador_id: string }>(),
    admin
      .from("reveals")
      .select("id")
      .eq("invoice_id", doc.invoice_id)
      .eq("fondeador_id", user.id)
      .maybeSingle<{ id: string }>(),
  ]);

  // 3. Registro de la descarga: su ID es el identificador único que va en
  //    la marca de agua.
  const { data: descargaId } = await admin.rpc("log_event", {
    p_accion: "documento_descargado",
    p_invoice_id: doc.invoice_id,
    p_reveal_id: reveal?.id ?? doc.reveal_id,
    p_entidad: "document",
    p_entidad_id: doc.id,
    p_meta: { nombre: doc.nombre },
    p_actor_id: user.id,
  });

  // 4. Original desde Storage (nunca se modifica)
  const { data: blob, error: errDescarga } = await admin.storage
    .from("facturas")
    .download(doc.storage_path);
  if (errDescarga || !blob) {
    return NextResponse.json({ error: "No se pudo leer el documento" }, { status: 502 });
  }
  const original = new Uint8Array(await blob.arrayBuffer());
  const mime = mimeDesdeNombre(doc.nombre, doc.mime ?? blob.type ?? null);
  const nombreBase = doc.nombre.replace(/\.[^.]+$/, "").replace(/[^\w.\-]+/g, "_") || "documento";

  // La PyME dueña de la factura recibe su propio archivo sin marcar.
  if (invoice?.operador_id === user.id) {
    return new NextResponse(original.slice(), {
      headers: {
        "Content-Type": mime,
        "Content-Disposition": `inline; filename="${doc.nombre.replace(/"/g, "")}"`,
        "Cache-Control": "no-store",
      },
    });
  }

  let marcado: Uint8Array;
  try {
    marcado = await marcarDocumento(original, mime, {
      operacionId: doc.invoice_id,
      usuarioId: user.id,
      usuarioNombre: perfil?.empresa || perfil?.nombre || "Usuario",
      descargaId: typeof descargaId === "string" ? descargaId : crypto.randomUUID(),
      fecha: new Date(),
    });
  } catch {
    return NextResponse.json(
      { error: "Este formato de archivo no se puede mostrar. Pedile a la otra parte un PDF, JPG o PNG." },
      { status: 415 },
    );
  }

  return new NextResponse(marcado.slice(), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${nombreBase}-ViaFactoring.pdf"`,
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex",
    },
  });
}

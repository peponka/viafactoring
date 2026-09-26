import "server-only";
import { PDFDocument, StandardFonts, degrees, rgb, type PDFPage, type PDFFont } from "pdf-lib";

export type MarcaDeAgua = {
  operacionId: string;
  usuarioId: string;
  usuarioNombre: string;
  descargaId: string;
  fecha: Date;
};

// Las fuentes estándar de PDF solo cubren Latin-1: se normaliza el texto
// para que un nombre con caracteres raros no rompa la descarga.
function latin1(texto: string) {
  return texto
    .normalize("NFC")
    .replace(/[^\x20-\x7E\xA0-\xFF]/g, "")
    .slice(0, 160);
}

function corto(id: string) {
  return id.replace(/-/g, "").slice(0, 8).toUpperCase();
}

function estampar(page: PDFPage, fuente: PDFFont, m: MarcaDeAgua) {
  const { width, height } = page.getSize();
  const fecha = new Intl.DateTimeFormat("es-PY", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "America/Asuncion",
  }).format(m.fecha);

  // Diagonal tenue, repetida para que no se pueda recortar fácil
  const diagonal = latin1(`ViaFactoring · ${m.usuarioNombre} · ${corto(m.descargaId)}`);
  const tam = Math.max(14, Math.min(width, height) / 22);
  for (let y = height * 0.15; y < height; y += height / 3) {
    page.drawText(diagonal, {
      x: width * 0.08,
      y,
      size: tam,
      font: fuente,
      color: rgb(0.45, 0.45, 0.45),
      opacity: 0.18,
      rotate: degrees(30),
    });
  }

  // Pie legible con todos los datos de trazabilidad
  const pie = latin1(
    `ViaFactoring · Operación ${corto(m.operacionId)} · ${m.usuarioNombre} (${corto(m.usuarioId)}) · ${fecha} · Descarga ${m.descargaId}`,
  );
  const tamPie = 6.5;
  page.drawRectangle({ x: 0, y: 0, width, height: 14, color: rgb(1, 1, 1), opacity: 0.85 });
  page.drawText(pie, { x: 8, y: 4.5, size: tamPie, font: fuente, color: rgb(0.2, 0.2, 0.2) });
}

// Devuelve SIEMPRE un PDF marcado: los PDF se marcan página por página, las
// fotos JPG/PNG se insertan en una página nueva y se marcan.
export async function marcarDocumento(
  bytes: Uint8Array,
  mime: string,
  m: MarcaDeAgua,
): Promise<Uint8Array> {
  let pdf: PDFDocument;

  if (mime === "application/pdf") {
    pdf = await PDFDocument.load(bytes, { ignoreEncryption: true });
  } else if (mime === "image/jpeg" || mime === "image/png") {
    pdf = await PDFDocument.create();
    const img = mime === "image/png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const anchoMax = 595; // A4 en puntos
    const escala = Math.min(1, anchoMax / img.width);
    const w = img.width * escala;
    const h = img.height * escala;
    const page = pdf.addPage([w, h]);
    page.drawImage(img, { x: 0, y: 0, width: w, height: h });
  } else {
    throw new Error("formato_no_soportado");
  }

  const fuente = await pdf.embedFont(StandardFonts.Helvetica);
  for (const page of pdf.getPages()) estampar(page, fuente, m);

  pdf.setProducer("ViaFactoring");
  pdf.setSubject(latin1(`Operación ${m.operacionId} · descargado por ${m.usuarioId}`));
  pdf.setKeywords([
    "ViaFactoring",
    `operacion:${m.operacionId}`,
    `usuario:${m.usuarioId}`,
    `descarga:${m.descargaId}`,
    `fecha:${m.fecha.toISOString()}`,
  ]);

  return pdf.save();
}

export function mimeDesdeNombre(nombre: string, mime: string | null) {
  if (mime) return mime;
  const n = nombre.toLowerCase();
  if (n.endsWith(".pdf")) return "application/pdf";
  if (n.endsWith(".png")) return "image/png";
  if (n.endsWith(".jpg") || n.endsWith(".jpeg")) return "image/jpeg";
  return "application/octet-stream";
}

import "server-only";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { formatFecha, formatMonto } from "@/lib/format";

// Modelos prellenados para formalizar la cesión después de la comisión:
// contrato de cesión de crédito y aviso al deudor. Son modelos orientativos:
// ViaFactoring no es parte y lo dice en el propio documento.

export type Parte = {
  nombre: string;
  empresa: string | null;
  ruc: string | null;
  email: string | null;
  telefono: string | null;
};

export type DatosCesion = {
  cedente: Parte; // la PyME
  cesionario: Parte; // el fondeador
  factura: {
    numero: string | null;
    cdc: string | null;
    deudorNombre: string | null;
    deudorRuc: string | null;
    monto: number;
    moneda: string;
    vencimiento: string | null;
  };
  oferta: {
    anticipo: number;
    conRecurso: boolean | null;
    notificaDeudor: boolean | null;
    fechaPago: string | null;
  };
  operacionId: string;
};

const BLANCO = "____________________";

function latin1(t: string) {
  return t.normalize("NFC").replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/[–—]/g, "-").replace(/[^\x20-\x7E\xA0-\xFF]/g, "");
}

function quien(p: Parte) {
  return p.empresa?.trim() || p.nombre?.trim() || BLANCO;
}

class Hoja {
  private doc: PDFDocument;
  private page!: PDFPage;
  private y = 0;
  private readonly margen = 56;
  private readonly ancho = 595.28;
  private readonly alto = 841.89;

  constructor(
    doc: PDFDocument,
    private normal: PDFFont,
    private negrita: PDFFont,
  ) {
    this.doc = doc;
    this.nueva();
  }

  private nueva() {
    this.page = this.doc.addPage([this.ancho, this.alto]);
    this.y = this.alto - this.margen;
  }

  private lineas(texto: string, fuente: PDFFont, tam: number) {
    const max = this.ancho - this.margen * 2;
    const salida: string[] = [];
    for (const parrafo of latin1(texto).split("\n")) {
      let actual = "";
      for (const palabra of parrafo.split(/\s+/)) {
        const prueba = actual ? `${actual} ${palabra}` : palabra;
        if (fuente.widthOfTextAtSize(prueba, tam) > max && actual) {
          salida.push(actual);
          actual = palabra;
        } else {
          actual = prueba;
        }
      }
      salida.push(actual);
    }
    return salida;
  }

  texto(t: string, opciones: { tam?: number; negrita?: boolean; gris?: boolean; despues?: number } = {}) {
    const tam = opciones.tam ?? 10.5;
    const fuente = opciones.negrita ? this.negrita : this.normal;
    for (const l of this.lineas(t, fuente, tam)) {
      if (this.y < this.margen + tam) this.nueva();
      this.page.drawText(l, {
        x: this.margen,
        y: this.y - tam,
        size: tam,
        font: fuente,
        color: opciones.gris ? rgb(0.4, 0.4, 0.45) : rgb(0.06, 0.09, 0.16),
      });
      this.y -= tam * 1.45;
    }
    this.y -= opciones.despues ?? 6;
  }

  espacio(n = 10) {
    this.y -= n;
  }

  firmas(izq: string, der: string) {
    if (this.y < this.margen + 90) this.nueva();
    this.y -= 50;
    const mitad = (this.ancho - this.margen * 2) / 2;
    for (const [i, nombre] of [izq, der].entries()) {
      const x = this.margen + i * (mitad + 20);
      this.page.drawLine({
        start: { x, y: this.y },
        end: { x: x + mitad - 30, y: this.y },
        thickness: 0.7,
        color: rgb(0.3, 0.3, 0.35),
      });
      this.page.drawText(latin1(nombre).slice(0, 48), { x, y: this.y - 13, size: 9.5, font: this.normal });
      this.page.drawText("Firma y aclaración", { x, y: this.y - 25, size: 8.5, font: this.normal, color: rgb(0.4, 0.4, 0.45) });
    }
    this.y -= 40;
  }

  pie(t: string) {
    for (const page of this.doc.getPages()) {
      page.drawText(latin1(t), { x: this.margen, y: 28, size: 7.5, font: this.normal, color: rgb(0.45, 0.45, 0.5) });
    }
  }
}

function datosParte(rol: string, p: Parte) {
  return `${rol}: ${quien(p)}${p.empresa && p.nombre ? `, representada por ${p.nombre}` : ""}, RUC/C.I. N.º ${p.ruc?.trim() || BLANCO}, con domicilio en ${BLANCO}, email ${p.email || BLANCO}, teléfono ${p.telefono || BLANCO}.`;
}

export async function contratoCesionPdf(c: DatosCesion): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("Contrato de cesión de crédito");
  const h = new Hoja(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold));
  const f = c.factura;
  const o = c.oferta;

  h.texto("CONTRATO DE CESIÓN DE CRÉDITO", { tam: 15, negrita: true, despues: 4 });
  h.texto(
    "Modelo orientativo prellenado por ViaFactoring con los datos de la operación acordada en la plataforma. ViaFactoring no es parte de este contrato ni garantiza su contenido: revisalo con tu asesor y completá los espacios en blanco antes de firmar.",
    { tam: 8.5, gris: true, despues: 14 },
  );

  h.texto(`En la ciudad de ${BLANCO}, a los ____ días del mes de ____________ de ______, entre:`);
  h.texto(datosParte("EL CEDENTE", c.cedente));
  h.texto(datosParte("EL CESIONARIO", c.cesionario), { despues: 10 });
  h.texto("convienen celebrar el presente contrato de cesión de crédito, sujeto a las siguientes cláusulas:", { despues: 10 });

  h.texto("PRIMERA - Objeto", { negrita: true, despues: 2 });
  h.texto(
    `El Cedente cede y transfiere al Cesionario el crédito documentado en la factura ${f.numero ? `N.º ${f.numero}` : `N.º ${BLANCO}`}${f.cdc ? `, código de control (CDC) ${f.cdc}` : ""}, emitida a ${f.deudorNombre || BLANCO}${f.deudorRuc ? `, RUC ${f.deudorRuc}` : ""} (en adelante, "el Deudor"), por un monto de ${formatMonto(f.monto, f.moneda)}, con vencimiento el ${f.vencimiento ? formatFecha(f.vencimiento) : BLANCO}, con todos los derechos y acciones que le corresponden.`,
  );

  h.texto("SEGUNDA - Precio y forma de pago", { negrita: true, despues: 2 });
  h.texto(
    `Como precio de la cesión, el Cesionario pagará al Cedente la suma de ${formatMonto(o.anticipo, f.moneda)} el día ${o.fechaPago ? formatFecha(o.fechaPago) : BLANCO}, mediante transferencia bancaria a la cuenta N.º ${BLANCO} del banco ${BLANCO}, a nombre del Cedente. El comprobante de la transferencia servirá de recibo.`,
  );

  h.texto("TERCERA - Responsabilidad por el pago del Deudor", { negrita: true, despues: 2 });
  if (o.conRecurso === true) {
    h.texto(
      `La cesión es CON RECURSO. Si el Deudor no paga el crédito a su vencimiento, el Cedente se obliga a reintegrar al Cesionario el precio recibido dentro de los ${"_____"} días hábiles de ser requerido, más ${BLANCO}. Una vez reintegrado, el crédito vuelve al Cedente.`,
    );
  } else if (o.conRecurso === false) {
    h.texto(
      "La cesión es SIN RECURSO. El Cedente garantiza la existencia y legitimidad del crédito, pero no la solvencia del Deudor: si el Deudor no paga, el riesgo es del Cesionario, salvo que el crédito no existiera, fuera nulo o ya estuviera pagado o cedido.",
    );
  } else {
    h.texto(`La cesión es ${BLANCO} (con recurso / sin recurso).`);
  }

  h.texto("CUARTA - Aviso al Deudor y cobro", { negrita: true, despues: 2 });
  if (o.notificaDeudor === true) {
    h.texto(
      "Las partes notificarán la cesión al Deudor por escrito. Desde que el Deudor sea notificado, deberá pagar el crédito directamente al Cesionario. Si el Cedente recibiera algún pago del Deudor, lo transferirá al Cesionario dentro de los dos (2) días hábiles siguientes.",
    );
  } else if (o.notificaDeudor === false) {
    h.texto(
      "La cesión no será notificada al Deudor por ahora. El Cedente seguirá recibiendo el pago y se obliga a transferir al Cesionario el monto cobrado dentro de los dos (2) días hábiles de recibido. El Cesionario podrá notificar la cesión al Deudor si el Cedente incumple esta obligación.",
    );
  } else {
    h.texto(`El aviso de la cesión al Deudor será ${BLANCO}.`);
  }

  h.texto("QUINTA - Declaraciones del Cedente", { negrita: true, despues: 2 });
  h.texto(
    "El Cedente declara que el crédito existe y es exigible; que corresponde a una venta de bienes o prestación de servicios efectivamente realizada; que no fue cobrado, cedido ni dado en garantía antes; y que el Deudor no tiene reclamos ni compensaciones conocidas que oponer. Se obliga a entregar al Cesionario la factura y la documentación respaldatoria que tenga.",
  );

  h.texto("SEXTA - Gastos e impuestos", { negrita: true, despues: 2 });
  h.texto(`Los gastos e impuestos que genere este contrato estarán a cargo de ${BLANCO}.`);

  h.texto("SÉPTIMA - Domicilios y jurisdicción", { negrita: true, despues: 2 });
  h.texto(
    `Las partes constituyen domicilio en los indicados arriba y se someten a la jurisdicción de los tribunales de ${BLANCO}, renunciando a cualquier otra.`,
  );

  h.texto("En prueba de conformidad, se firman dos (2) ejemplares de un mismo tenor y a un solo efecto.", { despues: 4 });
  h.firmas(`El Cedente: ${quien(c.cedente)}`, `El Cesionario: ${quien(c.cesionario)}`);

  h.pie(`ViaFactoring · Operación ${c.operacionId.slice(0, 8).toUpperCase()} · Modelo orientativo, revisalo antes de firmar.`);
  return doc.save();
}

export async function avisoDeudorPdf(c: DatosCesion): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle("Aviso de cesión al deudor");
  const h = new Hoja(doc, await doc.embedFont(StandardFonts.Helvetica), await doc.embedFont(StandardFonts.HelveticaBold));
  const f = c.factura;

  h.texto(`${BLANCO}, ____ de ____________ de ______`, { despues: 18 });
  h.texto("Señores", { despues: 0 });
  h.texto(f.deudorNombre || BLANCO, { negrita: true, despues: 0 });
  if (f.deudorRuc) h.texto(`RUC ${f.deudorRuc}`, { despues: 0 });
  h.texto("Presente", { despues: 16 });

  h.texto("Ref.: Notificación de cesión de crédito", { negrita: true, despues: 12 });
  h.texto(
    `Por medio de la presente les comunicamos que ${quien(c.cedente)} cedió a ${quien(c.cesionario)} el crédito correspondiente a la factura ${f.numero ? `N.º ${f.numero}` : `N.º ${BLANCO}`}${f.cdc ? ` (CDC ${f.cdc})` : ""}, por ${formatMonto(f.monto, f.moneda)}, con vencimiento el ${f.vencimiento ? formatFecha(f.vencimiento) : BLANCO}.`,
  );
  h.texto(
    `A partir de la recepción de esta nota, les pedimos realizar el pago de esa factura a ${quien(c.cesionario)}, mediante transferencia a la cuenta N.º ${BLANCO} del banco ${BLANCO}, a nombre de ${BLANCO}. El pago hecho de esa forma tendrá pleno efecto cancelatorio.`,
  );
  h.texto("Ante cualquier consulta, pueden comunicarse con cualquiera de los firmantes. Los saludamos atentamente.", { despues: 8 });

  h.firmas(`Cedente: ${quien(c.cedente)}`, `Cesionario: ${quien(c.cesionario)}`);
  h.espacio(10);
  h.texto("Recibí la presente notificación:", { despues: 2 });
  h.firmas(`Por ${f.deudorNombre || "el Deudor"}`, "Fecha de recepción");

  h.pie(`ViaFactoring · Operación ${c.operacionId.slice(0, 8).toUpperCase()} · Modelo orientativo, revisalo antes de enviar.`);
  return doc.save();
}

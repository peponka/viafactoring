"use server";

import { firmarLectura } from "@/lib/lectura-firmada";
import { createClient } from "@/lib/supabase/server";
import { leerCdc, rucBase } from "@/lib/cdc";

// Lee una foto o PDF de una factura con IA (Claude, vision) y devuelve los
// campos que pudo identificar, para precargar el formulario de carga.
//
// IMPORTANTE: esto es una ayuda, no una fuente de verdad. El operador
// SIEMPRE tiene que revisar los datos antes de guardar — una foto borrosa,
// una factura manuscrita o un formato poco común pueden hacer que la IA
// lea mal un número o un nombre. Por eso esta función nunca guarda nada
// por sí sola: solo devuelve datos para que el formulario los muestre
// como sugerencia editable.

export type ExtraccionFactura = {
  cdc?: string;
  emisor_nombre?: string;
  emisor_ruc?: string;
  deudor_ruc?: string;
  deudor_nombre?: string;
  deudor_contacto?: string;
  monto?: string;
  moneda?: string;
  numero?: string;
  fecha_vencimiento?: string;
  descripcion?: string;
};

export type ExtraccionResult =
  | { data: ExtraccionFactura; lectura?: string | null; avisoDeudor?: string | null; error?: undefined }
  | { data?: undefined; error: string };

const PROMPT = `Esta imagen o documento es una factura o comprobante de cobro. Extraé los datos que veas con confianza y devolvé ÚNICAMENTE un objeto JSON (sin texto antes ni después, sin bloques de código) con estas claves. Si un dato no aparece o no estás seguro, dejalo como "" — nunca inventes valores.

MUY IMPORTANTE: una factura tiene dos partes distintas.
- EMISOR (vendedor, quien cobra): aparece arriba, en el encabezado, junto al logo, el timbrado y "RUC". En el KuDE paraguayo es el bloque superior.
- RECEPTOR / CLIENTE (comprador, quien debe pagar = deudor): aparece debajo, en la sección "Datos del receptor", "Cliente", "Señor(es)", "Nombre o razón social" o "RUC/C.I. del cliente".
Nunca pongas los datos del emisor como deudor. Si no podés distinguir con seguridad quién es el cliente, dejá deudor_nombre y deudor_ruc vacíos.
{
  "cdc": "CDC de la factura electrónica: el código de 44 dígitos que aparece debajo del código QR del KuDE (solo los dígitos, sin espacios). Vacío si no aparece",
  "emisor_nombre": "nombre o razón social de quien emite la factura (el vendedor, en el encabezado)",
  "emisor_ruc": "RUC de quien emite la factura (el vendedor), con su dígito verificador, por ejemplo 80012345-6",
  "deudor_ruc": "RUC o cédula del CLIENTE que debe pagar (el comprador, sección del receptor), con dígito verificador si aparece",
  "deudor_nombre": "nombre del CLIENTE que debe pagar la factura (sección del receptor), nunca el del emisor",
  "deudor_contacto": "teléfono o email del deudor, si aparece",
  "monto": "monto total, solo el número, con punto como separador decimal, sin símbolo de moneda ni separador de miles",
  "moneda": "USD, PYG o ARS según corresponda, o vacío si no está claro",
  "numero": "número de factura con el formato 001-001-0000123 si es posible",
  "fecha_vencimiento": "fecha de vencimiento en formato YYYY-MM-DD, si aparece",
  "descripcion": "descripción breve de la operación (ruta, tipo de carga, servicio, etc.), si se puede inferir"
}`;

export async function extraerDatosFacturaAction(
  formData: FormData,
): Promise<ExtraccionResult> {
  const file = formData.get("documento");
  if (!(file instanceof File) || file.size === 0) {
    return { error: "Subí una foto o PDF de la factura primero." };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      error:
        "La lectura automática no está disponible por ahora. Completá los datos a mano.",
    };
  }

  const mediaType = file.type || "image/jpeg";
  const isPdf = mediaType === "application/pdf";
  const bytes = Buffer.from(await file.arrayBuffer());
  const base64 = bytes.toString("base64");

  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL_OCR || "claude-sonnet-5-5",
        max_tokens: 1024,
        messages: [
          {
            role: "user",
            content: [
              {
                type: isPdf ? "document" : "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: base64,
                },
              },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      }),
    });

    if (!res.ok) {
      return { error: `No se pudo leer el documento (error ${res.status}).` };
    }

    const json = await res.json();
    const textBlock = (json?.content as Array<{ type: string; text?: string }>)?.find(
      (b) => b.type === "text",
    );
    if (!textBlock?.text) {
      return { error: "No se pudo leer el documento." };
    }

    const match = textBlock.text.match(/\{[\s\S]*\}/);
    if (!match) {
      return { error: "No se pudo interpretar el documento." };
    }

    const parsed = JSON.parse(match[0]) as ExtraccionFactura;
    const avisoDeudor = await revisarDeudor(parsed);
    // Firma del monto leído: al publicar se compara con el monto final.
    const lectura = parsed.monto ? firmarLectura(parsed.monto, parsed.moneda || "") : null;
    return { data: parsed, lectura, avisoDeudor };
  } catch {
    return { error: "Error al leer el documento. Probá de nuevo." };
  }
}

// La IA a veces toma al emisor (la propia PyME) como deudor. Si el deudor
// leído coincide con el emisor —por RUC, por el RUC del CDC o por el nombre
// de la PyME—, se vacía y se le pide a la PyME que lo complete.
function normalizarNombre(t: string | null | undefined) {
  return (t ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(s\.?a\.?|s\.?r\.?l\.?|e\.?i\.?r\.?l\.?|sociedad anonima)\b/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mismoNombre(a: string | null | undefined, b: string | null | undefined) {
  const x = normalizarNombre(a);
  const y = normalizarNombre(b);
  if (x.length < 3 || y.length < 3) return false;
  if (x === y || x.includes(y) || y.includes(x)) return true;
  // Mismas palabras en otro orden ("Kellemen Garcia Pedro" vs "Pedro Kellemen")
  const px = new Set(x.split(" ").filter((p) => p.length > 2));
  const py = y.split(" ").filter((p) => p.length > 2);
  const comunes = py.filter((p) => px.has(p)).length;
  return comunes >= 2 && comunes >= Math.min(px.size, py.length);
}

async function revisarDeudor(d: ExtraccionFactura): Promise<string | null> {
  const deudorRuc = rucBase(d.deudor_ruc);
  const rucsEmisor = new Set(
    [rucBase(d.emisor_ruc), d.cdc ? rucBase(leerCdc(d.cdc)?.ruc ?? null) : null].filter(Boolean) as string[],
  );
  const nombres: (string | null | undefined)[] = [d.emisor_nombre];
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      const { data: p } = await supabase.from("profiles").select("nombre, empresa").eq("id", user.id).single<{ nombre: string; empresa: string | null }>();
      nombres.push(p?.nombre, p?.empresa);
    }
  } catch {
    // sin sesión: se compara solo con lo leído
  }

  const esEmisor =
    (deudorRuc != null && rucsEmisor.has(deudorRuc)) || nombres.some((n) => mismoNombre(d.deudor_nombre, n));
  if (!esEmisor) return null;

  d.deudor_nombre = "";
  d.deudor_ruc = "";
  d.deudor_contacto = "";
  return "La IA leyó tus propios datos como deudor. Completá a mano quién te debe la factura (el cliente).";
}

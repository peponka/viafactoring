"use server";

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
  deudor_nombre?: string;
  deudor_contacto?: string;
  monto?: string;
  moneda?: string;
  numero?: string;
  fecha_vencimiento?: string;
  descripcion?: string;
};

export type ExtraccionResult =
  | { data: ExtraccionFactura; error?: undefined }
  | { data?: undefined; error: string };

const PROMPT = `Esta imagen o documento es una factura o comprobante de cobro. Extraé los datos que veas con confianza y devolvé ÚNICAMENTE un objeto JSON (sin texto antes ni después, sin bloques de código) con estas claves. Si un dato no aparece o no estás seguro, dejalo como "" — nunca inventes valores:
{
  "deudor_nombre": "nombre de la empresa o persona que debe pagar la factura",
  "deudor_contacto": "teléfono o email del deudor, si aparece",
  "monto": "monto total, solo el número, con punto como separador decimal, sin símbolo de moneda ni separador de miles",
  "moneda": "USD, PYG o ARS según corresponda, o vacío si no está claro",
  "numero": "número de factura",
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
        "La lectura automática no está configurada todavía (falta ANTHROPIC_API_KEY en el servidor).",
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
        model: "claude-sonnet-4-5",
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
    return { data: parsed };
  } catch {
    return { error: "Error al leer el documento. Probá de nuevo." };
  }
}

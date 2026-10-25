import "server-only";

// Revisa con IA si una foto o PDF subido al chat trae datos para contactarse
// por fuera (teléfono, email, WhatsApp, redes, dirección de una persona).
// No se rechaza el documento: si los trae, queda guardado pero se habilita
// para la otra parte recién al cerrar el trato (nivel 4). Así se puede
// seguir compartiendo, por ejemplo, una remisión con membrete.

const API = "https://api.anthropic.com/v1/messages";

const PROMPT = `Mirá este documento compartido en una negociación entre una pyme y un fondeador.
¿Contiene datos que permitan contactar directamente a una persona o empresa por fuera de la plataforma? Cuentan: números de teléfono o celular, WhatsApp, emails, usuarios de redes sociales, sitios web o links, códigos QR de contacto.
No cuentan: RUC, número de factura, CDC, montos, fechas, nombres de empresas sin datos de contacto.

Respondé SOLO con JSON: {"contacto": true|false, "que": "qué dato encontraste, en pocas palabras"}`;

export async function documentoTieneContacto(
  archivo: File,
): Promise<{ contacto: boolean; que: string } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const tipo = archivo.type || "image/jpeg";
  const esPdf = tipo === "application/pdf";
  const datos = Buffer.from(await archivo.arrayBuffer()).toString("base64");

  const control = new AbortController();
  const corte = setTimeout(() => control.abort(), 25000);
  try {
    const res = await fetch(API, {
      method: "POST",
      signal: control.signal,
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL_DOCS || "claude-haiku-5-5",
        max_tokens: 150,
        messages: [
          {
            role: "user",
            content: [
              { type: esPdf ? "document" : "image", source: { type: "base64", media_type: tipo, data: datos } },
              { type: "text", text: PROMPT },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      console.error("[revisar-documento] Claude API", res.status, (await res.text().catch(() => "")).slice(0, 300));
      return null;
    }
    const json = (await res.json()) as { content: { type: string; text?: string }[] };
    const m = json.content.map((b) => b.text ?? "").join("").match(/\{[\s\S]*\}/);
    if (!m) return null;
    const p = JSON.parse(m[0]) as { contacto?: unknown; que?: unknown };
    return { contacto: p.contacto === true, que: typeof p.que === "string" ? p.que : "" };
  } catch {
    return null;
  } finally {
    clearTimeout(corte);
  }
}

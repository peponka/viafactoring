import "server-only";

// Segunda capa de la barrera anti-contacto: la primera son los patrones de la
// base (teléfonos, emails, links, @usuarios), que no se pueden saltear. Esta
// capa le pregunta a la IA por los intentos disfrazados que no siguen ningún
// patrón ("buscame como la distribuidora de Pedro en San Lorenzo", "pasá por
// la oficina de Mcal. López y Brasilia", "mi número es el del pie de la
// factura").
//
// Solo se consulta cuando el mensaje tiene algo sospechoso (pista()), para
// no gastar en cada "hola". Si la IA no responde, el mensaje sigue: los
// patrones de la base ya filtraron lo obvio.

const API = "https://api.anthropic.com/v1/messages";

const SISTEMA = `Moderás el chat de una plataforma paraguaya donde una pyme y un fondeador negocian el descuento de una factura. Hasta que se paga la comisión de la plataforma, NO pueden compartir datos de contacto ni coordinar para seguir por fuera.

Marcá contacto=true si el mensaje:
- comparte o pide un teléfono, WhatsApp, email, red social, usuario, sitio web o link, aunque esté disfrazado (números en palabras, separados, con letras en lugar de dígitos, "arroba", "punto com");
- da datos para encontrarse o buscarse por fuera: nombre completo para buscar, dirección, oficina, "buscame en Google como…";
- propone verse en persona, llamarse o seguir la conversación fuera de la plataforma.

Marcá contacto=false para la negociación normal: montos, plazos, tasas, preguntas sobre la factura, el deudor, documentos, recurso, fechas, RUC o número de factura.

Respondé SOLO con JSON: {"contacto": true|false, "razon": "frase corta en castellano"}`;

const PISTAS =
  /(\d{3,}|\b(cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\b.*\b(cero|uno|dos|tres|cuatro|cinco|seis|siete|ocho|nueve)\b|\bmi\s|\bbusc|\bencontr|\bcontact|\bdirecci|\bcalle\b|\bavenida\b|\bav\.|\boficina|\bredes\b|\bperfil|\busuario|\bcuenta\b|\blink|\bp[aá]gina|\bweb\b|\bsitio|\bcorreo|\bmail|\bwhats|\bwsp\b|\btel[eé]f|\bcel|\bllam|\bafuera|\bfuera\b|\bdirecto|\bprivado|\bpersonal|\blinked|\binsta|\bface|\bgoogle|\bnos vemos|\breuni[oó]n|\bcaf[eé]\b|\bvisit|\bpas[aá] por|\bvení|\barroba|\bpunto com)/i;

export function pista(texto: string): boolean {
  return PISTAS.test(texto);
}

export async function pareceContacto(texto: string): Promise<{ contacto: boolean; razon: string } | null> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const modelo = process.env.ANTHROPIC_MODEL_MODERACION || "claude-haiku-5-5";

  const control = new AbortController();
  const corte = setTimeout(() => control.abort(), 6000);
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
        model: modelo,
        max_tokens: 120,
        system: SISTEMA,
        messages: [{ role: "user", content: `Mensaje:\n"""${texto.slice(0, 2000)}"""` }],
      }),
    });
    if (!res.ok) {
      console.error("[moderar] Claude API", res.status, (await res.text().catch(() => "")).slice(0, 300));
      return null;
    }
    const json = (await res.json()) as { content: { type: string; text?: string }[] };
    const salida = json.content.map((b) => b.text ?? "").join("");
    const m = salida.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const p = JSON.parse(m[0]) as { contacto?: unknown; razon?: unknown };
    return { contacto: p.contacto === true, razon: typeof p.razon === "string" ? p.razon : "" };
  } catch {
    return null;
  } finally {
    clearTimeout(corte);
  }
}

import "server-only";
import type { Investigacion } from "@/lib/database.types";

// Investigación con IA de las empresas de una factura (la pyme que la
// descuenta y su deudor), usando la búsqueda web de la API de Claude.
//
// Reglas que se le piden al modelo y que la pantalla respeta:
//   * solo hechos con fuente, nunca recomendaciones ni puntajes;
//   * si no puede confirmar que un resultado es de la misma empresa
//     (homónimos), lo dice en vez de suponer;
//   * si no encuentra nada, lo dice.
// El resultado se guarda una vez por factura (ver reservar_investigacion).

const API = "https://api.anthropic.com/v1/messages";

type Empresa = { nombre: string | null; ruc: string | null };

const SISTEMA = `Sos un asistente de verificación de datos públicos para una plataforma paraguaya que conecta empresas con facturas por cobrar y fondeadores.
Tu trabajo es juntar HECHOS PÚBLICOS verificables sobre dos empresas de Paraguay, buscando en la web. No das opiniones, no recomendás invertir o no invertir, no asignás puntajes ni niveles de riesgo.

Qué buscar de cada empresa:
- Si existe y a qué se dedica (sitio web, redes, directorios).
- Desde cuándo opera, si aparece.
- Contratos con el Estado paraguayo (buscá en contrataciones.gov.py por nombre o RUC).
- Noticias relevantes: quiebra, convocatoria de acreedores, embargos, juicios, denuncias o estafas. Si no hay, decilo.

Reglas:
- Usá solo información que encontraste en las búsquedas. No inventes.
- Si no podés confirmar que un resultado es de la MISMA empresa (puede haber homónimos), decilo explícitamente y no lo trates como confirmado.
- Escribí en castellano rioplatense neutro, frases cortas y concretas.
- Al terminar, respondé ÚNICAMENTE con un objeto JSON, sin texto antes ni después ni bloques de código:
{
  "resumen": "2 o 3 frases neutrales con lo más importante de ambas empresas",
  "hallazgos": [ { "tipo": "ok" | "info" | "alerta", "texto": "un hecho concreto, mencionando a qué empresa se refiere" } ],
  "contratos_estado": "resumen de contratos con el Estado encontrados, o null si no encontraste",
  "sitio_web": "sitio web oficial del deudor si lo encontraste, o null"
}
"tipo": "ok" para hechos que confirman existencia o actividad normal, "alerta" solo para noticias negativas concretas con fuente, "info" para el resto. Máximo 8 hallazgos.`;

type Bloque = {
  type: string;
  text?: string;
  content?: unknown;
  citations?: { url?: string; title?: string }[];
};

function describir(e: Empresa, rol: string) {
  const partes = [e.nombre?.trim(), e.ruc ? `RUC ${e.ruc}` : null].filter(Boolean);
  return partes.length ? `${rol}: ${partes.join(", ")}` : `${rol}: (sin datos)`;
}

export async function investigarEmpresas(datos: {
  pyme: Empresa;
  deudor: Empresa;
  deudorEsEstado: boolean;
}): Promise<Investigacion> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const modelo = process.env.ANTHROPIC_MODEL_INVESTIGACION || "claude-haiku-5-5";
  if (!apiKey) {
    return { estado: "error", error: "La investigación con IA no está configurada (falta ANTHROPIC_API_KEY)." };
  }

  const pedido = [
    "Investigá estas dos empresas de Paraguay:",
    describir(datos.pyme, "Empresa que vende la factura (emisor)"),
    describir(datos.deudor, datos.deudorEsEstado ? "Deudor (institución del Estado)" : "Deudor (quien tiene que pagar la factura)"),
    datos.deudorEsEstado
      ? "Como el deudor es una institución pública, buscá además noticias recientes sobre atrasos en sus pagos a proveedores."
      : "",
  ]
    .filter(Boolean)
    .join("\n");

  const mensajes: { role: "user" | "assistant"; content: unknown }[] = [{ role: "user", content: pedido }];
  const fuentes = new Map<string, string>();
  let texto = "";

  try {
    // La API puede pausar un turno largo de búsqueda (pause_turn): se reenvía
    // tal cual hasta 3 veces.
    for (let vuelta = 0; vuelta < 3; vuelta++) {
      const res = await fetch(API, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: modelo,
          max_tokens: 3000,
          system: SISTEMA,
          messages: mensajes,
          tools: [
            {
              type: "web_search_20250305",
              name: "web_search",
              max_uses: 6,
              user_location: { type: "approximate", country: "PY", timezone: "America/Asuncion" },
            },
          ],
        }),
      });
      if (!res.ok) {
        return { estado: "error", error: `El servicio de IA respondió con error ${res.status}.`, modelo };
      }
      const json = (await res.json()) as { content: Bloque[]; stop_reason: string };

      for (const b of json.content) {
        if (b.type === "web_search_tool_result" && Array.isArray(b.content)) {
          for (const r of b.content as { url?: string; title?: string }[]) {
            if (r.url && !fuentes.has(r.url)) fuentes.set(r.url, r.title || r.url);
          }
        }
        if (b.type === "text" && b.text) {
          texto += b.text;
          for (const c of b.citations ?? []) {
            if (c.url && !fuentes.has(c.url)) fuentes.set(c.url, c.title || c.url);
          }
        }
      }

      if (json.stop_reason !== "pause_turn") break;
      mensajes.push({ role: "assistant", content: json.content });
    }

    const match = texto.match(/\{[\s\S]*\}\s*$/) ?? texto.match(/\{[\s\S]*\}/);
    if (!match) return { estado: "error", error: "No se pudo interpretar la respuesta de la IA.", modelo };
    const parsed = JSON.parse(match[0]) as Omit<Investigacion, "estado">;

    const hallazgos = (parsed.hallazgos ?? [])
      .filter((h) => h && typeof h.texto === "string" && ["ok", "info", "alerta"].includes(h.tipo))
      .slice(0, 8);

    return {
      estado: "lista",
      resumen: typeof parsed.resumen === "string" ? parsed.resumen : undefined,
      hallazgos,
      contratos_estado: typeof parsed.contratos_estado === "string" ? parsed.contratos_estado : null,
      sitio_web: typeof parsed.sitio_web === "string" ? parsed.sitio_web : null,
      fuentes: [...fuentes.entries()].slice(0, 10).map(([url, titulo]) => ({ url, titulo })),
      modelo,
    };
  } catch {
    return { estado: "error", error: "No se pudo completar la investigación. Probá de nuevo más tarde.", modelo };
  }
}

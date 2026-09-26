import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/server";

// Cotización referencial diaria del Banco Central del Paraguay (USD → PYG).
// El BCP no publica una API documentada: se lee su página pública. Si la
// lectura falla, se sigue usando la última cotización (hasta 3 días) y, si
// no hay ninguna vigente, se abre una excepción para el admin.
const FUENTE = "https://www.bcp.gov.py/webapps/web/cotizacion/monedas";

export function parsearCotizacionBcp(html: string): number | null {
  const texto = html.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
  const m = texto.match(/USD\s+1,0+\s+(\d{1,2}\.\d{3},\d{1,4})/);
  if (!m) return null;
  const valor = Number(m[1].replace(/\./g, "").replace(",", "."));
  // sanidad: guaraníes por dólar en un rango razonable
  if (!Number.isFinite(valor) || valor < 2000 || valor > 30000) return null;
  return valor;
}

export async function actualizarTipoCambio(): Promise<{ ok: boolean; valor?: number; detalle: string }> {
  const admin = createServiceRoleClient();
  const hoy = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(new Date());

  const { data: existente } = await admin.from("fx_rates").select("fecha").eq("fecha", hoy).maybeSingle();
  if (existente) return { ok: true, detalle: "ya estaba cargada" };

  try {
    const res = await fetch(FUENTE, { cache: "no-store" });
    const valor = res.ok ? parsearCotizacionBcp(await res.text()) : null;
    if (valor) {
      await admin.rpc("guardar_tipo_cambio", { p_fecha: hoy, p_pyg: valor, p_fuente: "BCP referencial" });
      return { ok: true, valor, detalle: "BCP" };
    }
  } catch {
    // sigue abajo
  }

  const { data: vigente } = await admin.rpc("tipo_cambio_vigente");
  if (!vigente || !(vigente as { pyg_por_unidad?: number }).pyg_por_unidad) {
    await admin.rpc("abrir_excepcion", {
      p_tipo: "sin_tipo_cambio",
      p_detalle: "No se pudo leer la cotización del BCP y no hay una vigente. Cargala a mano en Excepciones.",
    });
    return { ok: false, detalle: "sin cotización vigente" };
  }
  return { ok: true, detalle: "se usa la última cotización vigente" };
}

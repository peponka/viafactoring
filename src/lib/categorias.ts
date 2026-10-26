import type { CategoriaFondeador, DeudorTipo, FondeadorPerfil, InvoiceTeaser, Riesgo } from "@/lib/database.types";

// Rangos base por categoría, en USD. La fuente de verdad es la base
// (rango_categoria / app_config); esto se usa para mostrar textos y para
// validar en el formulario antes de mandar.
export const RANGO_CATEGORIA: Record<CategoriaFondeador, { min: number; max: number | null }> = {
  individual: { min: 3000, max: 25000 },
  empresa: { min: 5000, max: 100000 },
  cooperativa: { min: 10000, max: null },
  financiera: { min: 15000, max: null },
  banco: { min: 25000, max: null },
  fondo: { min: 25000, max: null },
};

/** Para la PyME se agrupan en inversores (personas y empresas) e instituciones. */
export function esInversor(c: CategoriaFondeador) {
  return c === "individual" || c === "empresa";
}

export const MONTO_MINIMO_USD = 3000;

export const CATEGORIA_LABEL: Record<CategoriaFondeador, string> = {
  individual: "Inversor individual",
  empresa: "Empresa o family office",
  cooperativa: "Cooperativa",
  financiera: "Financiera",
  banco: "Banco",
  fondo: "Fondo de inversión o casa de bolsa",
};

export const DEUDOR_TIPO_LABEL: Record<DeudorTipo, string> = {
  privado: "Empresa privada",
  estado: "Estado",
};

export const RIESGOS: Riesgo[] = ["bajo", "medio", "alto"];

export function usd(n: number) {
  return "USD " + Math.round(n).toLocaleString("es-PY");
}

export function rangoTexto(min: number | null | undefined, max: number | null | undefined) {
  if (min == null) return "Sin definir";
  return max == null ? `Desde ${usd(min)}` : `${usd(min)} – ${usd(max)}`;
}

/** Comisión de cierre (USD) según el monto ofrecido en USD. Igual que deal_fee_for_monto. */
export function comisionCierreUsd(montoUsd: number) {
  if (montoUsd < 10000) return 80;
  if (montoUsd < 25000) return 180;
  if (montoUsd < 50000) return 350;
  return Math.ceil(montoUsd * 0.007);
}

/**
 * Misma lógica que factura_encaja() en la base, aplicada a un teaser.
 * `industriasConPadre` mapea id de industria → id de su industria padre.
 */
export function teaserEncaja(
  perfil: FondeadorPerfil,
  t: InvoiceTeaser,
  industriasConPadre: Map<string, string | null>,
) {
  if (!perfil.categoria || t.monto_usd == null) return false;
  const base = RANGO_CATEGORIA[perfil.categoria];
  const min = Math.max(perfil.monto_min_usd ?? base.min, base.min);
  const max = perfil.monto_max_usd ?? base.max;
  if (t.monto_usd < min) return false;
  if (max != null && t.monto_usd > max) return false;
  if (perfil.plazo_max_dias != null && t.plazo_dias > perfil.plazo_max_dias) return false;
  if (!perfil.riesgos.includes(t.riesgo)) return false;
  if (!perfil.deudor_tipos.includes(t.deudor_tipo)) return false;
  if (perfil.industrias.length > 0) {
    const id = t.industry_id;
    const padre = id ? industriasConPadre.get(id) ?? null : null;
    if (!id || !(perfil.industrias.includes(id) || (padre && perfil.industrias.includes(padre)))) return false;
  }
  return true;
}

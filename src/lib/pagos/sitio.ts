// URL pública del sitio (para armar links de retorno y de notificaciones).
// En las versiones de prueba (preview) se usa el link fijo de la rama, así
// los retornos de pago y los links de los emails vuelven a la misma versión
// y no a producción.
export function siteUrl() {
  if (process.env.VERCEL_ENV === "preview") {
    const rama = process.env.VERCEL_BRANCH_URL || process.env.VERCEL_URL;
    if (rama) return `https://${rama}`;
  }
  if (process.env.NEXT_PUBLIC_SITE_URL) return process.env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

// Firma lo que la IA leyó de la factura (monto y moneda), para que al
// publicar el servidor sepa que ese dato salió de la lectura y no lo
// escribió la PyME. Clave: la service role (solo existe en el servidor).

function clave() {
  return process.env.LECTURA_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
}

function normalizar(monto: string, moneda: string) {
  const n = Number(String(monto).replace(/[^0-9.]/g, ""));
  return `${Number.isFinite(n) ? n.toFixed(2) : ""}|${(moneda || "").toUpperCase()}`;
}

export function firmarLectura(monto: string, moneda: string): string | null {
  if (!clave() || !monto) return null;
  const cuerpo = normalizar(monto, moneda);
  const firma = createHmac("sha256", clave()).update(cuerpo).digest("base64url");
  return `${Buffer.from(cuerpo).toString("base64url")}.${firma}`;
}

export function leerLectura(token: string | null | undefined): { monto: number; moneda: string | null } | null {
  if (!token || !clave()) return null;
  const [b64, firma] = token.split(".");
  if (!b64 || !firma) return null;
  const cuerpo = Buffer.from(b64, "base64url").toString();
  const esperada = createHmac("sha256", clave()).update(cuerpo).digest("base64url");
  const a = Buffer.from(firma);
  const b = Buffer.from(esperada);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  const [monto, moneda] = cuerpo.split("|");
  const n = Number(monto);
  if (!Number.isFinite(n) || n <= 0) return null;
  return { monto: n, moneda: moneda || null };
}

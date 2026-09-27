// Normaliza un teléfono de contacto. Acepta formatos paraguayos (0981 123 456,
// +595 981 123 456) y números internacionales con prefijo +. Devuelve null
// si no parece un teléfono válido.
export function normalizarTelefono(raw: string): string | null {
  const limpio = raw.trim().replace(/[\s\-().]/g, "");
  if (!limpio) return null;
  if (/^\+\d{8,15}$/.test(limpio)) return limpio;
  if (/^0\d{8,10}$/.test(limpio)) return limpio; // 0981123456, 021123456
  if (/^595\d{8,10}$/.test(limpio)) return `+${limpio}`;
  return null;
}

export const AYUDA_TELEFONO = "Ej: 0981 123 456 o +595 981 123 456";

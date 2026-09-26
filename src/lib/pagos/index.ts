import "server-only";
import type { PaymentProvider } from "./tipos";
import { mockProvider } from "./mock";
import { pagoparProvider } from "./pagopar";

const PROVEEDORES: Record<string, PaymentProvider> = {
  mock: mockProvider,
  pagopar: pagoparProvider,
};

// Pasarela activa (PAYMENT_PROVIDER). Sin configurar → null: el pago en
// línea queda deshabilitado y el intento se registra como excepción.
export function pasarelaActiva(): PaymentProvider | null {
  const nombre = process.env.PAYMENT_PROVIDER;
  if (!nombre) return null;
  return PROVEEDORES[nombre] ?? null;
}

// Para el webhook: solo se aceptan avisos de la pasarela activa.
export function pasarelaPorNombre(nombre: string): PaymentProvider | null {
  const activa = pasarelaActiva();
  return activa && activa.nombre === nombre ? activa : null;
}

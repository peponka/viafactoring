"use client";

import { Input } from "@/components/ui";

// Campo de monto con el formato de Paraguay: puntos para los miles y coma
// para los decimales (28.500.000 · 1.250,50). Se muestra formateado mientras
// se escribe y el formulario recibe el número limpio ("28500000", "1250.5")
// en un campo oculto con el `name` indicado.

export function normalizarMonto(texto: string, decimales: number): string {
  const limpio = texto.replace(/[^\d,]/g, "");
  const [entero = "", ...resto] = limpio.split(",");
  const ent = entero.replace(/^0+(?=\d)/, "");
  if (decimales === 0 || resto.length === 0) return ent;
  return `${ent || "0"}.${resto.join("").slice(0, decimales)}`;
}

export function mostrarMonto(valor: string): string {
  if (!valor) return "";
  const [entero, dec] = valor.split(".");
  const conPuntos = entero.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return dec !== undefined ? `${conPuntos},${dec}` : conPuntos;
}

export function MontoInput({
  name,
  value,
  onChange,
  decimales = 0,
  required,
  autoFocus,
  className,
  invalido,
  placeholder,
}: {
  name: string;
  value: string;
  onChange: (valor: string) => void;
  decimales?: number;
  required?: boolean;
  autoFocus?: boolean;
  className?: string;
  invalido?: boolean;
  placeholder?: string;
}) {
  return (
    <>
      <Input
        type="text"
        inputMode={decimales > 0 ? "decimal" : "numeric"}
        autoComplete="off"
        required={required}
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={mostrarMonto(value)}
        onChange={(e) => onChange(normalizarMonto(e.target.value, decimales))}
        className={`num ${className ?? ""}`}
        aria-invalid={invalido || undefined}
      />
      <input type="hidden" name={name} value={value} />
    </>
  );
}

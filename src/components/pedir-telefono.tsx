"use client";

import { useActionState } from "react";
import { guardarTelefonoAction } from "@/app/perfil/actions";

// Aviso para cuentas creadas antes de que el teléfono fuera obligatorio.
// Es lo que se comparte con la otra parte cuando se cierra un acuerdo.
export function PedirTelefono() {
  const [state, action, pending] = useActionState(guardarTelefonoAction, { error: null });
  if (state.ok) return null;
  return (
    <div className="bg-warn-soft border-b border-line">
      <form
        action={action}
        className="wrap max-w-6xl mx-auto px-6 py-3 flex items-center gap-3 flex-wrap text-sm"
      >
        <span className="font-medium">Agregá tu teléfono de contacto.</span>
        <span className="text-ink-soft">Se comparte con la otra parte solo cuando cierran un acuerdo.</span>
        <input
          type="tel"
          name="telefono"
          required
          autoComplete="tel"
          placeholder="0981 123 456"
          className="rounded-lg border border-line bg-surface px-3 py-1.5 text-sm w-44"
        />
        <button
          type="submit"
          disabled={pending}
          className="rounded-lg bg-accent text-accent-ink font-semibold px-3 py-1.5 disabled:opacity-50"
        >
          {pending ? "Guardando…" : "Guardar"}
        </button>
        {state.error && <span className="text-critical w-full">{state.error}</span>}
      </form>
    </div>
  );
}

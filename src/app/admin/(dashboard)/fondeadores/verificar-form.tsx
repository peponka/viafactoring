"use client";

import { useState, useTransition } from "react";
import { verificarFondeadorAction } from "@/app/admin/actions";
import { Button, ErrorText } from "@/components/ui";

export function VerificarForm({ fondeadorId }: { fondeadorId: string }) {
  const [nota, setNota] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function decidir(aprobar: boolean) {
    setError(null);
    startTransition(async () => {
      const r = await verificarFondeadorAction(fondeadorId, aprobar, nota);
      if (r.error) setError(r.error);
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      <label className="flex flex-col gap-1.5 text-sm">
        <span className="text-ink-soft font-medium">Nota para el fondeador (obligatoria si pedís cambios)</span>
        <input
          value={nota}
          onChange={(e) => setNota(e.target.value)}
          placeholder="Ej: la constancia de RUC está vencida"
          className="min-h-11 rounded-xl border border-line-strong px-3.5 outline-none focus:border-accent focus:ring-4 focus:ring-accent-soft"
        />
      </label>
      <div className="flex gap-2 flex-wrap">
        <Button onClick={() => decidir(true)} disabled={pending}>Aprobar</Button>
        <Button variant="ghost" onClick={() => decidir(false)} disabled={pending}>Pedir cambios</Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, ErrorText, Textarea } from "@/components/ui";
import { cancelarDealRoomAction, reportarProblemaAction } from "../actions";

// Acciones poco frecuentes, fuera de la pantalla principal.
export function Menu({ revealId, puedeRetirarse }: { revealId: string; puedeRetirarse: boolean }) {
  const router = useRouter();
  const [abierto, setAbierto] = useState(false);
  const [modo, setModo] = useState<"reportar" | "retirarse" | null>(null);
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function enviar() {
    setError(null);
    startTransition(async () => {
      if (modo === "reportar") {
        const r = await reportarProblemaAction(revealId, texto);
        if (r.error) return setError(r.error);
        setAviso("Recibimos tu reporte. Te respondemos por email.");
      } else {
        const r = await cancelarDealRoomAction(revealId, texto);
        if (r.error) return setError(r.error);
        router.refresh();
      }
      setModo(null);
      setTexto("");
    });
  }

  return (
    <div className="relative shrink-0">
      <button
        type="button"
        onClick={() => setAbierto((v) => !v)}
        className="w-9 h-9 rounded-full border border-line text-ink-soft hover:text-ink"
        aria-label="Más opciones"
      >
        ⋯
      </button>
      {aviso && <p className="absolute right-0 top-11 w-64 text-sm bg-good-soft text-good rounded-lg p-3 z-10">{aviso}</p>}
      {abierto && (
        <div className="absolute right-0 top-11 w-72 rounded-xl border border-line bg-surface shadow-lg p-3 z-20 flex flex-col gap-2">
          {modo === null ? (
            <>
              <button type="button" className="text-left text-sm px-2 py-1.5 rounded hover:bg-surface-2" onClick={() => { setModo("reportar"); setAviso(null); }}>
                Reportar un problema
              </button>
              {puedeRetirarse && (
                <button type="button" className="text-left text-sm px-2 py-1.5 rounded hover:bg-surface-2 text-critical" onClick={() => setModo("retirarse")}>
                  Retirarme de esta negociación
                </button>
              )}
            </>
          ) : (
            <>
              <p className="text-sm font-medium">
                {modo === "reportar" ? "¿Qué pasó?" : "¿Seguro que querés retirarte? La otra parte lo va a ver en la conversación."}
              </p>
              <Textarea
                rows={3}
                value={texto}
                maxLength={2000}
                onChange={(e) => setTexto(e.target.value)}
                placeholder={modo === "reportar" ? "Contanos brevemente" : "Motivo (opcional)"}
              />
              <ErrorText>{error}</ErrorText>
              <div className="flex gap-2">
                <Button onClick={enviar} disabled={pending} variant={modo === "retirarse" ? "danger" : "primary"} className="!py-2 !px-3 text-sm">
                  {modo === "reportar" ? "Enviar" : "Sí, retirarme"}
                </Button>
                <Button variant="ghost" onClick={() => setModo(null)} disabled={pending} className="!py-2 !px-3 text-sm">
                  Volver
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

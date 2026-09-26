"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { detectarContacto } from "@/lib/contacto";
import { formatFechaHora } from "@/lib/format";
import { Badge, Button, ErrorText, Select, Textarea } from "@/components/ui";
import type { DocumentRow, Message } from "@/lib/database.types";
import {
  enviarMensajeAction,
  marcarLeidosAction,
  resolverSolicitudAction,
} from "../actions";

type TipoEnvio = "mensaje" | "pregunta" | "solicitud" | "respuesta";

const TIPO_LABEL: Record<string, string> = {
  pregunta: "Pregunta",
  solicitud: "Solicitud",
  respuesta: "Respuesta",
};

export function Chat({
  revealId,
  rol,
  mensajes,
  documentos,
  soloLectura,
}: {
  revealId: string;
  rol: "fondeador" | "operador" | "admin";
  mensajes: Message[];
  documentos: DocumentRow[];
  soloLectura: boolean;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [tipo, setTipo] = useState<TipoEnvio>("mensaje");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const finRef = useRef<HTMLDivElement>(null);

  const avisoContacto = useMemo(() => detectarContacto(texto), [texto]);
  const docsPorId = useMemo(() => new Map(documentos.map((d) => [d.id, d])), [documentos]);

  // Mensajes nuevos en tiempo real (Supabase Realtime respeta la RLS: solo
  // llegan los de este Deal Room si el usuario es parte).
  useEffect(() => {
    const supabase = createClient();
    const canal = supabase
      .channel(`deal-room-${revealId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `reveal_id=eq.${revealId}`,
        },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [revealId, router]);

  useEffect(() => {
    finRef.current?.scrollIntoView({ block: "end" });
    if (rol !== "admin") void marcarLeidosAction(revealId);
  }, [mensajes.length, revealId, rol]);

  function enviar() {
    const cuerpo = texto.trim();
    if (!cuerpo) return;
    setError(null);
    startTransition(async () => {
      const res = await enviarMensajeAction(revealId, cuerpo, tipo);
      if (res.error) {
        setError(res.error);
      } else {
        setTexto("");
        setTipo("mensaje");
        router.refresh();
      }
    });
  }

  function resolver(id: string) {
    startTransition(async () => {
      const res = await resolverSolicitudAction(revealId, id);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto flex flex-col gap-3 pr-1 max-h-[60vh] min-h-[320px]">
        {mensajes.map((m) => {
          if (m.autor_rol === "sistema") {
            return (
              <p key={m.id} className="text-center text-xs text-ink-soft bg-surface-2 rounded-lg px-3 py-2 mx-6">
                {m.cuerpo}
                <span className="block num mt-0.5 opacity-70">{formatFechaHora(m.created_at)}</span>
              </p>
            );
          }
          const mio = m.autor_rol === rol;
          const doc = m.document_id ? docsPorId.get(m.document_id) : null;
          return (
            <div key={m.id} className={`flex ${mio ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
                  mio ? "bg-accent text-accent-ink" : "bg-surface-2 text-ink"
                }`}
              >
                <div className="flex items-center gap-2 mb-1 text-xs opacity-80">
                  <span className="font-semibold">
                    {mio ? "Vos" : m.autor_rol === "fondeador" ? "Fondeador" : "PyME"}
                  </span>
                  {TIPO_LABEL[m.tipo] && <Badge tone="gold">{TIPO_LABEL[m.tipo]}</Badge>}
                  {m.tipo === "solicitud" && m.solicitud_estado === "resuelta" && (
                    <Badge tone="good">Resuelta</Badge>
                  )}
                </div>
                <p className="whitespace-pre-wrap break-words">{m.cuerpo}</p>
                {doc && (
                  <a
                    href={`/api/documentos/${doc.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline font-medium block mt-1"
                  >
                    Abrir {doc.nombre} ↗
                  </a>
                )}
                {mio && m.contacto_detectado && (
                  <p className="text-xs mt-1 opacity-80">
                    Este mensaje incluye datos de contacto. El contacto directo se habilita al cerrar el acuerdo.
                  </p>
                )}
                <div className="flex items-center justify-between gap-3 mt-1">
                  <span className="num text-[.7rem] opacity-70">{formatFechaHora(m.created_at)}</span>
                  {!soloLectura &&
                    !mio &&
                    m.tipo === "solicitud" &&
                    m.solicitud_estado === "abierta" && (
                      <button
                        type="button"
                        onClick={() => resolver(m.id)}
                        className="text-xs font-semibold underline"
                        disabled={pending}
                      >
                        Marcar resuelta
                      </button>
                    )}
                </div>
              </div>
            </div>
          );
        })}
        <div ref={finRef} />
      </div>

      {!soloLectura && (
        <div className="border-t border-line pt-4 mt-4 flex flex-col gap-2">
          <div className="flex gap-2">
            <Select
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoEnvio)}
              className="!w-auto"
              aria-label="Tipo de mensaje"
            >
              <option value="mensaje">Mensaje</option>
              <option value="pregunta">Pregunta</option>
              <option value="solicitud">Solicitud (ej: falta un documento)</option>
              <option value="respuesta">Respuesta</option>
            </Select>
          </div>
          <Textarea
            rows={3}
            value={texto}
            maxLength={4000}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escribí tu mensaje…"
          />
          {avisoContacto.length > 0 && (
            <p className="text-xs text-warn bg-warn-soft rounded-lg px-3 py-2">
              Parece que estás compartiendo datos de contacto. El contacto directo se habilita al
              cerrar el acuerdo; mantener la conversación acá deja registro para las dos partes.
            </p>
          )}
          <ErrorText>{error}</ErrorText>
          <Button onClick={enviar} disabled={pending || !texto.trim()} className="w-fit">
            {pending ? "Enviando…" : "Enviar"}
          </Button>
        </div>
      )}
    </div>
  );
}

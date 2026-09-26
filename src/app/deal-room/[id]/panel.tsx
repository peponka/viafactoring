"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, ErrorText, Input, Select } from "@/components/ui";
import { formatFecha, formatMonto } from "@/lib/format";
import type { DealRoomDetail, DocumentRow } from "@/lib/database.types";
import {
  cancelarDealRoomAction,
  checklistAction,
  declararTransferenciaAction,
  subirDocumentoAction,
  type Resultado,
} from "../actions";

// -------------------------------------------------------------------------
// Cierre: comisión de ViaFactoring, contacto directo (Nivel 4) y
// confirmación declarativa de la transferencia (que ocurre FUERA de la
// plataforma).
// -------------------------------------------------------------------------
export function Cierre({ d }: { d: DealRoomDetail }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const aceptada = d.ofertas.find((o) => o.estado === "aceptada");

  if (!aceptada) return null;

  function declarar() {
    if (!aceptada) return;
    setError(null);
    startTransition(async () => {
      const res = await declararTransferenciaAction(d.reveal_id, aceptada.id);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  const nivel4 = d.nivel >= 4;
  const yoDeclare =
    d.rol === "fondeador" ? !!aceptada.fondos_enviados_at : !!aceptada.fondos_recibidos_at;

  return (
    <div>
      <p className="font-semibold mb-2">Cierre</p>
      <p className="text-sm">
        Oferta aceptada: <span className="num font-medium">{formatMonto(aceptada.monto_ofrecido, d.invoice.moneda)}</span>
      </p>

      {!nivel4 && d.comision && (
        <div className="rounded-xl bg-surface-2 p-4 mt-3 text-sm">
          {d.rol === "fondeador" ? (
            <>
              <p className="font-medium">
                Comisión de cierre de ViaFactoring: {formatMonto(d.comision.monto, d.comision.moneda)}
              </p>
              {d.comision.payment_link ? (
                <a
                  href={d.comision.payment_link}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-accent font-medium underline block mt-1"
                >
                  Pagar la comisión ↗
                </a>
              ) : (
                <p className="text-ink-soft mt-1">Te vamos a enviar el link de pago en breve.</p>
              )}
              <p className="text-ink-soft mt-2">
                Cuando se confirme el pago se habilita el contacto directo con la PyME para formalizar.
              </p>
            </>
          ) : (
            <p className="text-ink-soft">
              Esperando que el fondeador pague la comisión de cierre de ViaFactoring. Al confirmarse
              se habilita el contacto directo para formalizar la cesión.
            </p>
          )}
        </div>
      )}

      {nivel4 && (
        <div className="rounded-xl border border-good p-4 mt-3 text-sm">
          <p className="font-medium mb-2">Contacto directo habilitado</p>
          <dl className="grid gap-1">
            {d.contraparte.empresa && (
              <div><dt className="inline text-ink-soft">Empresa: </dt><dd className="inline">{d.contraparte.empresa}</dd></div>
            )}
            {d.contraparte.nombre && (
              <div><dt className="inline text-ink-soft">Nombre: </dt><dd className="inline">{d.contraparte.nombre}</dd></div>
            )}
            {d.contraparte.telefono && (
              <div><dt className="inline text-ink-soft">Teléfono: </dt><dd className="inline num">{d.contraparte.telefono}</dd></div>
            )}
            {d.contraparte.email && (
              <div><dt className="inline text-ink-soft">Email: </dt><dd className="inline">{d.contraparte.email}</dd></div>
            )}
            {d.rol === "fondeador" && d.invoice.operador_contacto && (
              <div><dt className="inline text-ink-soft">Contacto de la operación: </dt><dd className="inline">{d.invoice.operador_contacto}</dd></div>
            )}
            {d.rol === "fondeador" && d.invoice.deudor_contacto && (
              <div><dt className="inline text-ink-soft">Contacto del deudor: </dt><dd className="inline">{d.invoice.deudor_contacto}</dd></div>
            )}
          </dl>
        </div>
      )}

      {nivel4 && d.rol !== "admin" && (
        <div className="mt-4 text-sm">
          <p className="text-ink-soft mb-2">
            El anticipo se transfiere directo del fondeador a la PyME. ViaFactoring no recibe ni
            mueve ese dinero; esta confirmación es solo para dejar registro.
          </p>
          <div className="flex flex-col gap-1 mb-3">
            <span>
              Fondeador:{" "}
              {aceptada.fondos_enviados_at ? `transfirió el ${formatFecha(aceptada.fondos_enviados_at)}` : "pendiente"}
            </span>
            <span>
              PyME:{" "}
              {aceptada.fondos_recibidos_at ? `recibió el ${formatFecha(aceptada.fondos_recibidos_at)}` : "pendiente"}
            </span>
          </div>
          {!yoDeclare && (
            <Button onClick={declarar} disabled={pending}>
              {d.rol === "fondeador" ? "Ya transferí los fondos" : "Recibí los fondos"}
            </Button>
          )}
          <ErrorText>{error}</ErrorText>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------------------
// Checklist: los ítems automáticos los marca el sistema; las partes marcan
// los manuales.
// -------------------------------------------------------------------------
export function Checklist({ d }: { d: DealRoomDetail }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const editable = d.rol !== "admin" && d.estado !== "cancelled";

  function toggle(key: string, hecho: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await checklistAction(d.reveal_id, key, hecho);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div>
      <p className="font-semibold mb-2">Checklist</p>
      <ul className="flex flex-col gap-1.5 text-sm">
        {d.checklist.map((item) => (
          <li key={item.key} className="flex items-start gap-2">
            <input
              type="checkbox"
              className="mt-0.5 accent-[var(--color-accent)]"
              checked={item.hecho}
              disabled={item.auto || !editable || pending}
              onChange={(e) => toggle(item.key, e.target.checked)}
              aria-label={item.label}
            />
            <span className={item.hecho ? "" : "text-ink-soft"}>
              {item.label}
              {item.auto && <span className="text-xs text-ink-soft"> · automático</span>}
            </span>
          </li>
        ))}
      </ul>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

// -------------------------------------------------------------------------
// Documentos: siempre por /api/documentos/[id] (con watermark y registro).
// -------------------------------------------------------------------------
const TIPO_DOC_LABEL: Record<string, string> = {
  factura: "Factura",
  factura_tapada: "Factura (datos tapados)",
  remito: "Remito",
  contrato: "Contrato",
  certificado: "Certificado",
  otro: "Otro",
};

export function Documentos({ d, documentos }: { d: DealRoomDetail; documentos: DocumentRow[] }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, action, pending] = useActionState<Resultado, FormData>(subirDocumentoAction, {
    error: null,
  });
  const puedeSubir = d.rol !== "admin" && d.estado !== "cancelled";

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      router.refresh();
    }
  }, [state, router]);

  return (
    <div>
      <p className="font-semibold mb-2">Documentos</p>
      {documentos.length === 0 ? (
        <p className="text-sm text-ink-soft">Todavía no hay documentos.</p>
      ) : (
        <ul className="flex flex-col gap-1.5 text-sm">
          {documentos.map((doc) => (
            <li key={doc.id} className="flex items-center justify-between gap-2">
              <a
                href={`/api/documentos/${doc.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-accent underline truncate"
              >
                {doc.nombre}
              </a>
              <Badge>{TIPO_DOC_LABEL[doc.tipo] ?? doc.tipo}</Badge>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-ink-soft mt-2">
        Cada descarga queda registrada y el archivo lleva una marca de agua con quién lo descargó.
      </p>

      {puedeSubir && (
        <form ref={formRef} action={action} className="flex flex-col gap-2 mt-3">
          <input type="hidden" name="reveal_id" value={d.reveal_id} />
          <Input type="file" name="archivo" accept="application/pdf,image/jpeg,image/png" required />
          <div className="flex gap-2">
            <Select name="tipo" defaultValue="otro" className="!w-auto">
              <option value="remito">Remito</option>
              <option value="contrato">Contrato</option>
              <option value="certificado">Certificado</option>
              <option value="otro">Otro</option>
            </Select>
            <Button type="submit" variant="ghost" disabled={pending}>
              {pending ? "Subiendo…" : "Compartir"}
            </Button>
          </div>
          <ErrorText>{state.error}</ErrorText>
        </form>
      )}
    </div>
  );
}

// -------------------------------------------------------------------------
// Retirarse del Deal Room antes de un acuerdo
// -------------------------------------------------------------------------
export function CancelarDealRoom({ d }: { d: DealRoomDetail }) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (d.rol === "admin" || (d.estado !== "open" && d.estado !== "negotiating")) return null;

  function cancelar() {
    startTransition(async () => {
      const res = await cancelarDealRoomAction(d.reveal_id, motivo);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="text-sm">
      {confirmando ? (
        <div className="flex flex-col gap-2">
          <Input
            placeholder="Motivo (opcional)"
            value={motivo}
            maxLength={300}
            onChange={(e) => setMotivo(e.target.value)}
          />
          <div className="flex gap-2">
            <Button variant="danger" onClick={cancelar} disabled={pending}>
              {pending ? "Cerrando…" : "Sí, cerrar el Deal Room"}
            </Button>
            <Button variant="ghost" onClick={() => setConfirmando(false)} disabled={pending}>
              Volver
            </Button>
          </div>
          <ErrorText>{error}</ErrorText>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setConfirmando(true)}
          className="text-ink-soft hover:text-critical underline"
        >
          Retirarme de este Deal Room
        </button>
      )}
    </div>
  );
}

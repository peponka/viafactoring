"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Badge, Button, ErrorText, Field, Input, Select, Textarea } from "@/components/ui";
import {
  descuentoImplicito,
  formatFecha,
  formatFechaHora,
  formatMonto,
  formatPct,
} from "@/lib/format";
import type { DealRoomDetail, DealRoomOferta } from "@/lib/database.types";
import { ofertarAction, responderOfertaAction, type Resultado } from "../actions";

const ESTADO_LABEL: Record<string, string> = {
  pendiente: "Pendiente",
  aceptada: "Aceptada",
  rechazada: "Rechazada",
  reemplazada: "Reemplazada",
  cancelada: "Cancelada",
};

function tono(estado: string) {
  if (estado === "aceptada") return "good" as const;
  if (estado === "pendiente") return "warn" as const;
  return "neutral" as const;
}

function siNoLabel(v: boolean | null) {
  if (v === true) return "Sí";
  if (v === false) return "No";
  return "Sin especificar";
}

function Condiciones({ o, d }: { o: DealRoomOferta; d: DealRoomDetail }) {
  const calc = descuentoImplicito(
    d.invoice.monto,
    o.monto_ofrecido,
    d.invoice.fecha_vencimiento,
    d.invoice.plazo_dias,
  );
  return (
    <div className="text-xs text-ink-soft grid grid-cols-2 gap-x-3 gap-y-1 mt-2">
      <span>Con recurso: {siNoLabel(o.con_recurso)}</span>
      <span>Notifica al deudor: {siNoLabel(o.notifica_deudor)}</span>
      <span>Pago previsto: {formatFecha(o.fecha_pago_prevista)}</span>
      <span>
        Descuento: {formatPct(calc?.descuento)}
        {calc?.anual != null ? ` (~${formatPct(calc.anual)} anual simple)` : ""}
      </span>
    </div>
  );
}

function FormOferta({
  d,
  contraofertaDe,
  onListo,
}: {
  d: DealRoomDetail;
  contraofertaDe: DealRoomOferta | null;
  onListo: () => void;
}) {
  const [state, action, pending] = useActionState<Resultado, FormData>(ofertarAction, {
    error: null,
  });
  const [monto, setMonto] = useState<string>(
    contraofertaDe ? String(contraofertaDe.monto_ofrecido) : "",
  );
  const calc = descuentoImplicito(
    d.invoice.monto,
    Number(monto) || 0,
    d.invoice.fecha_vencimiento,
    d.invoice.plazo_dias,
  );

  useEffect(() => {
    if (state.ok) onListo();
  }, [state.ok, onListo]);

  const def = (v: boolean | null | undefined) => (v === true ? "si" : v === false ? "no" : "");

  return (
    <form action={action} className="flex flex-col gap-3 mt-3">
      <input type="hidden" name="reveal_id" value={d.reveal_id} />
      <input type="hidden" name="invoice_id" value={d.invoice.id} />
      {contraofertaDe && <input type="hidden" name="offer_id" value={contraofertaDe.id} />}
      <Field label={`Anticipo (${d.invoice.moneda}) — la factura es de ${formatMonto(d.invoice.monto, d.invoice.moneda)}`}>
        <Input
          type="number"
          name="monto_ofrecido"
          min={1}
          max={d.invoice.monto}
          step="1"
          required
          value={monto}
          onChange={(e) => setMonto(e.target.value)}
        />
      </Field>
      {calc && Number(monto) > 0 && (
        <p className="text-xs text-ink-soft -mt-1">
          Descuento implícito {formatPct(calc.descuento)}
          {calc.anual != null ? ` · ~${formatPct(calc.anual)} anual simple a ${calc.dias} días` : ""}
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Con recurso">
          <Select name="con_recurso" defaultValue={def(contraofertaDe?.con_recurso)}>
            <option value="">Sin especificar</option>
            <option value="si">Sí</option>
            <option value="no">No</option>
          </Select>
        </Field>
        <Field label="Notifica al deudor">
          <Select name="notifica_deudor" defaultValue={def(contraofertaDe?.notifica_deudor)}>
            <option value="">Sin especificar</option>
            <option value="si">Sí</option>
            <option value="no">No</option>
          </Select>
        </Field>
      </div>
      <Field label="Fecha prevista de pago del anticipo">
        <Input
          type="date"
          name="fecha_pago_prevista"
          defaultValue={contraofertaDe?.fecha_pago_prevista ?? ""}
        />
      </Field>
      <Field label="Mensaje (opcional)">
        <Textarea name="mensaje" rows={2} maxLength={1000} />
      </Field>
      <ErrorText>{state.error}</ErrorText>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Enviando…" : contraofertaDe ? "Enviar contraoferta" : "Enviar oferta"}
      </Button>
    </form>
  );
}

export function Ofertas({ d }: { d: DealRoomDetail }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [formAbierto, setFormAbierto] = useState<"nueva" | "contra" | null>(null);

  const rol = d.rol;
  const negociable = d.estado === "open" || d.estado === "negotiating";
  const pendiente = d.ofertas.find((o) => o.estado === "pendiente") ?? null;
  const meToca = pendiente && rol !== "admin" && pendiente.autor_rol !== rol;
  const historial = [...d.ofertas].reverse();

  function responder(aceptar: boolean) {
    if (!pendiente) return;
    setError(null);
    startTransition(async () => {
      const res = await responderOfertaAction(d.reveal_id, pendiente.id, aceptar);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  const cerrarForm = () => {
    setFormAbierto(null);
    router.refresh();
  };

  return (
    <div>
      <p className="font-semibold mb-1">Ofertas</p>

      {pendiente ? (
        <div className="rounded-xl border border-line p-4 mt-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-sm text-ink-soft">
              {pendiente.parent_offer_id ? "Contraoferta" : "Oferta"} de{" "}
              {pendiente.autor_rol === rol ? "vos" : pendiente.autor_rol === "fondeador" ? "el fondeador" : "la PyME"}
            </span>
            <Badge tone="warn">{meToca ? "Te toca responder" : "Esperando respuesta"}</Badge>
          </div>
          <p className="num text-2xl font-semibold mt-1">
            {formatMonto(pendiente.monto_ofrecido, d.invoice.moneda)}
          </p>
          <Condiciones o={pendiente} d={d} />
          {pendiente.mensaje && <p className="text-sm mt-2">“{pendiente.mensaje}”</p>}

          {meToca && negociable && (
            <div className="flex gap-2 flex-wrap mt-4">
              <Button onClick={() => responder(true)} disabled={pending}>
                Aceptar
              </Button>
              <Button variant="ghost" onClick={() => setFormAbierto("contra")} disabled={pending}>
                Contraofertar
              </Button>
              <Button variant="danger" onClick={() => responder(false)} disabled={pending}>
                Rechazar
              </Button>
            </div>
          )}
          {meToca && negociable && (
            <p className="text-xs text-ink-soft mt-2">
              Aceptar cierra la factura con este fondeador. La comisión de cierre de ViaFactoring la
              paga el fondeador; el anticipo se transfiere directo entre las partes.
            </p>
          )}
          <ErrorText>{error}</ErrorText>
          {formAbierto === "contra" && (
            <FormOferta d={d} contraofertaDe={pendiente} onListo={cerrarForm} />
          )}
        </div>
      ) : negociable ? (
        <p className="text-sm text-ink-soft mt-1">
          {rol === "fondeador"
            ? "Todavía no hay una oferta en curso. Cuando tengas lo que necesitás, hacé tu oferta."
            : "Todavía no hay una oferta en curso. Cuando el fondeador oferte, vas a poder aceptarla, rechazarla o contraofertar."}
        </p>
      ) : null}

      {negociable && rol === "fondeador" && (!pendiente || pendiente.autor_rol === "fondeador") && (
        <div className="mt-3">
          {formAbierto === "nueva" ? (
            <FormOferta d={d} contraofertaDe={null} onListo={cerrarForm} />
          ) : (
            <Button variant={pendiente ? "ghost" : "primary"} onClick={() => setFormAbierto("nueva")}>
              {pendiente ? "Reemplazar mi oferta" : "Hacer una oferta"}
            </Button>
          )}
        </div>
      )}

      {historial.length > 0 && (
        <details className="mt-4" open={!pendiente}>
          <summary className="text-sm text-ink-soft cursor-pointer">
            Historial de ofertas ({historial.length})
          </summary>
          <ul className="mt-2 flex flex-col gap-2">
            {historial.map((o) => (
              <li key={o.id} className="text-sm border-l-2 border-line pl-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="num font-medium">{formatMonto(o.monto_ofrecido, d.invoice.moneda)}</span>
                  <Badge tone={tono(o.estado)}>{ESTADO_LABEL[o.estado] ?? o.estado}</Badge>
                  <span className="text-ink-soft text-xs">
                    {o.autor_rol === "fondeador" ? "fondeador" : "PyME"} · {formatFechaHora(o.created_at)}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

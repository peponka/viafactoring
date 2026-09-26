"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button, Card, ErrorText, Field, Input, Textarea } from "@/components/ui";
import {
  aplicarPagoVerificadoAction,
  cargarTipoCambioAction,
  devolverPagoAction,
  resolverExcepcionAction,
} from "@/app/admin/actions";

type Accion = "resolver" | "descartar" | "aplicar" | "devolver";

const TEXTO: Record<Accion, { boton: string; ayuda: string }> = {
  resolver: { boton: "Marcar resuelta", ayuda: "Qué hiciste para resolverla." },
  descartar: { boton: "Descartar", ayuda: "Por qué no requiere acción." },
  aplicar: {
    boton: "Aplicar pago verificado",
    ayuda: "Cómo verificaste que la pasarela cobró (se vuelve a consultar a la pasarela antes de aplicar).",
  },
  devolver: { boton: "Devolver el pago", ayuda: "Por qué se devuelve. La devolución se pide a la pasarela." },
};

export function AccionesExcepcion({ id, conPago }: { id: string; conPago: boolean }) {
  const router = useRouter();
  const [accion, setAccion] = useState<Accion | null>(null);
  const [motivo, setMotivo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function confirmar() {
    if (!accion) return;
    setError(null);
    startTransition(async () => {
      const r =
        accion === "aplicar"
          ? await aplicarPagoVerificadoAction(id, motivo)
          : accion === "devolver"
            ? await devolverPagoAction(id, motivo)
            : await resolverExcepcionAction(id, accion === "resolver" ? "resuelta" : "descartada", motivo);
      if (r.error) return setError(r.error);
      setAccion(null);
      setMotivo("");
      router.refresh();
    });
  }

  const opciones: Accion[] = conPago ? ["resolver", "descartar", "aplicar", "devolver"] : ["resolver", "descartar"];

  return (
    <div className="mt-4 border-t border-line pt-3">
      {accion ? (
        <div className="flex flex-col gap-2">
          <Field label={TEXTO[accion].ayuda}>
            <Textarea rows={2} value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={1000} />
          </Field>
          <ErrorText>{error}</ErrorText>
          <div className="flex gap-2">
            <Button onClick={confirmar} disabled={pending || motivo.trim().length < 5} className="!py-2 !px-4 text-sm">
              {TEXTO[accion].boton}
            </Button>
            <Button variant="ghost" onClick={() => setAccion(null)} disabled={pending} className="!py-2 !px-4 text-sm">
              Volver
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex gap-2 flex-wrap">
          {opciones.map((a) => (
            <Button key={a} variant="ghost" onClick={() => setAccion(a)} className="!py-1.5 !px-3 text-sm">
              {TEXTO[a].boton}
            </Button>
          ))}
        </div>
      )}
    </div>
  );
}

export function TipoCambioManual() {
  const router = useRouter();
  const hoy = new Date().toISOString().slice(0, 10);
  const [fecha, setFecha] = useState(hoy);
  const [valor, setValor] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card className="!p-5 mb-6 border-gold">
      <p className="font-semibold">No hay tipo de cambio vigente</p>
      <p className="text-sm text-ink-soft mt-1">
        El BCP no respondió. Mientras tanto no se pueden cobrar desbloqueos ni comisiones. Cargá la cotización
        referencial del día (guaraníes por dólar).
      </p>
      <div className="flex gap-3 items-end flex-wrap mt-3">
        <Field label="Fecha">
          <Input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        </Field>
        <Field label="Gs por USD">
          <Input type="number" step="0.01" min={2000} max={30000} value={valor} onChange={(e) => setValor(e.target.value)} />
        </Field>
        <Button
          disabled={pending || !valor}
          className="!py-2.5"
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const r = await cargarTipoCambioAction(fecha, Number(valor));
              if (r.error) setError(r.error);
              else router.refresh();
            })
          }
        >
          Guardar
        </Button>
      </div>
      <div className="mt-2">
        <ErrorText>{error}</ErrorText>
      </div>
    </Card>
  );
}

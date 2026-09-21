"use client";

import { useActionState, useMemo, useState } from "react";
import { crearFacturaAction, type FormState } from "../actions";
import { extraerDatosFacturaAction } from "../ocr";
import {
  Button,
  Card,
  ErrorText,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";

const initialState: FormState = { error: null };

// Mismo criterio que unlock_fee_for_monto() en la base de datos — se
// duplica acá solo para la vista previa en vivo mientras el operador
// completa el formulario. El cálculo real (el que efectivamente se cobra)
// siempre lo hace el servidor.
function unlockFeePreview(monto: number) {
  if (!monto) return null;
  if (monto <= 10000) return 100;
  if (monto <= 25000) return 200;
  if (monto <= 50000) return 300;
  if (monto <= 100000) return 450;
  if (monto <= 250000) return 650;
  return 900;
}

export default function NuevaFacturaPage() {
  const [state, formAction, pending] = useActionState(
    crearFacturaAction,
    initialState,
  );
  const [numero, setNumero] = useState("");
  const [deudorNombre, setDeudorNombre] = useState("");
  const [deudorContacto, setDeudorContacto] = useState("");
  const [monto, setMonto] = useState("");
  const [plazo, setPlazo] = useState("");
  const [moneda, setMoneda] = useState("USD");
  const [rubro, setRubro] = useState("");
  const [riesgo, setRiesgo] = useState("medio");
  const [fechaVencimiento, setFechaVencimiento] = useState("");
  const [descripcion, setDescripcion] = useState("");

  const [documento, setDocumento] = useState<File | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrApplied, setOcrApplied] = useState(false);

  const teaserPreview = useMemo(
    () => ({
      unlockFee: unlockFeePreview(Number(monto)),
    }),
    [monto],
  );

  async function handleExtraer() {
    if (!documento) return;
    setOcrLoading(true);
    setOcrError(null);
    const fd = new FormData();
    fd.set("documento", documento);
    const result = await extraerDatosFacturaAction(fd);
    setOcrLoading(false);

    if (!result.data) {
      setOcrError(result.error ?? "No se pudo leer el documento.");
      return;
    }

    const d = result.data;
    if (d.deudor_nombre) setDeudorNombre(d.deudor_nombre);
    if (d.deudor_contacto) setDeudorContacto(d.deudor_contacto);
    if (d.monto) setMonto(d.monto);
    if (d.moneda) setMoneda(d.moneda);
    if (d.numero) setNumero(d.numero);
    if (d.descripcion) setDescripcion(d.descripcion);
    if (d.fecha_vencimiento) {
      setFechaVencimiento(d.fecha_vencimiento);
      const dias = Math.round(
        (new Date(d.fecha_vencimiento).getTime() - Date.now()) / 86400000,
      );
      if (Number.isFinite(dias)) setPlazo(String(Math.max(0, dias)));
    }
    setOcrApplied(true);
  }

  return (
    <div className="grid md:grid-cols-[1.4fr_1fr] gap-8">
      <div>
        <h1 className="text-2xl font-semibold mb-1">Cargar factura</h1>
        <p className="text-ink-soft text-sm mb-6">
          Es gratis, siempre. Los fondeadores ven el monto y el vencimiento
          exactos sin pagar nada — recién pagan una tarifa para ver el
          deudor, tu contacto y la documentación.
        </p>
        <Card>
          <form action={formAction} className="flex flex-col gap-4" encType="multipart/form-data">
            <Field label="Documento de la factura (foto o PDF, opcional)">
              <Input
                type="file"
                name="documento"
                accept="image/*,application/pdf"
                onChange={(e) => {
                  setDocumento(e.target.files?.[0] ?? null);
                  setOcrError(null);
                  setOcrApplied(false);
                }}
              />
            </Field>

            {documento && (
              <div className="flex items-center gap-3">
                <Button
                  type="button"
                  variant="ghost"
                  disabled={ocrLoading}
                  onClick={handleExtraer}
                >
                  {ocrLoading ? "Leyendo documento…" : "Completar datos con IA"}
                </Button>
                {ocrError && <ErrorText>{ocrError}</ErrorText>}
              </div>
            )}

            {ocrApplied && (
              <div className="bg-warn-soft border border-warn rounded-xl px-4 py-3 text-sm text-ink">
                ⚠️ Estos campos se completaron automáticamente a partir del
                documento. Revisalos con atención antes de guardar — una foto
                borrosa o un formato poco común pueden hacer que la lectura
                venga incompleta o equivocada.
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <Field label="Rubro">
                <Input
                  type="text"
                  name="rubro"
                  list="rubro-sugerencias"
                  placeholder="Ej: fluvial, camiones, comercio, servicios..."
                  required
                  value={rubro}
                  onChange={(e) => setRubro(e.target.value)}
                />
                <datalist id="rubro-sugerencias">
                  <option value="Fluvial (barcaza/remolcador)" />
                  <option value="Camiones" />
                  <option value="Comercio" />
                  <option value="Servicios" />
                  <option value="Construcción" />
                  <option value="Industria" />
                </datalist>
              </Field>
              <Field label="Nº de factura (opcional)">
                <Input
                  type="text"
                  name="numero"
                  value={numero}
                  onChange={(e) => setNumero(e.target.value)}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Nombre del deudor">
                <Input
                  type="text"
                  name="deudor_nombre"
                  required
                  value={deudorNombre}
                  onChange={(e) => setDeudorNombre(e.target.value)}
                />
              </Field>
              <Field label="Contacto del deudor (opcional)">
                <Input
                  type="text"
                  name="deudor_contacto"
                  value={deudorContacto}
                  onChange={(e) => setDeudorContacto(e.target.value)}
                />
              </Field>
            </div>

            <div className="grid grid-cols-3 gap-4">
              <Field label="Monto">
                <Input
                  type="number"
                  name="monto"
                  min="0"
                  step="0.01"
                  required
                  value={monto}
                  onChange={(e) => setMonto(e.target.value)}
                />
              </Field>
              <Field label="Moneda">
                <Select
                  name="moneda"
                  value={moneda}
                  onChange={(e) => setMoneda(e.target.value)}
                >
                  <option value="USD">USD</option>
                  <option value="PYG">PYG</option>
                  <option value="ARS">ARS</option>
                </Select>
              </Field>
              <Field label="Plazo (días hasta el vencimiento)">
                <Input
                  type="number"
                  name="plazo_dias"
                  min="0"
                  required
                  value={plazo}
                  onChange={(e) => setPlazo(e.target.value)}
                />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Fecha de vencimiento (opcional)">
                <Input
                  type="date"
                  name="fecha_vencimiento"
                  value={fechaVencimiento}
                  onChange={(e) => setFechaVencimiento(e.target.value)}
                />
              </Field>
              <Field label="Riesgo (autoevaluado)">
                <Select
                  name="riesgo"
                  value={riesgo}
                  onChange={(e) => setRiesgo(e.target.value)}
                >
                  <option value="bajo">Bajo</option>
                  <option value="medio">Medio</option>
                  <option value="alto">Alto</option>
                </Select>
              </Field>
            </div>

            <Field label="Tu contacto para esta factura (opcional)">
              <Input type="text" name="operador_contacto" placeholder="Teléfono o email — se muestra recién cuando el fondeador paga la tarifa de desbloqueo" />
            </Field>

            <Field label="Descripción (opcional)">
              <Textarea
                name="descripcion"
                rows={3}
                placeholder="Ruta, tipo de carga, lo que ayude a evaluar la operación"
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </Field>

            <ErrorText>{state.error}</ErrorText>
            <Button type="submit" disabled={pending} className="w-full mt-2">
              {pending ? "Guardando…" : "Cargar factura"}
            </Button>
          </form>
        </Card>
      </div>

      <div>
        <p className="text-sm font-semibold text-ink-soft mb-3">
          Así la van a ver los fondeadores antes de pagar nada
        </p>
        <Card className="bg-surface-2 border-dashed">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="inline-block text-[.72rem] font-semibold px-2.5 py-1 rounded-full bg-surface text-ink-soft">
              {rubro || "Rubro"}
            </span>
            <span className="inline-block text-[.72rem] font-semibold px-2.5 py-1 rounded-full bg-surface text-ink-soft">
              {riesgo}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-ink-soft text-xs uppercase tracking-wide">Monto</p>
              <p className="num font-medium">
                {monto ? `${moneda} ${monto}` : "A confirmar"}
              </p>
            </div>
            <div>
              <p className="text-ink-soft text-xs uppercase tracking-wide">Plazo</p>
              <p className="num font-medium">
                {plazo ? `${plazo} días` : "A confirmar"}
              </p>
            </div>
            <div className="col-span-2">
              <p className="text-ink-soft text-xs uppercase tracking-wide">Deudor</p>
              <p className="font-medium">
                🔒 se habilita al pagar la tarifa de desbloqueo
                {teaserPreview.unlockFee
                  ? ` (${moneda} ${teaserPreview.unlockFee})`
                  : ""}
              </p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

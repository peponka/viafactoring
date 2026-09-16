"use client";

import { useActionState, useMemo, useState } from "react";
import { crearFacturaAction, type FormState } from "../actions";
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

function montoBanda(monto: number) {
  if (!monto) return "A confirmar";
  if (monto < 2000) return "0 – 2.000";
  if (monto < 5000) return "2.000 – 5.000";
  if (monto < 10000) return "5.000 – 10.000";
  if (monto < 25000) return "10.000 – 25.000";
  if (monto < 50000) return "25.000 – 50.000";
  if (monto < 100000) return "50.000 – 100.000";
  return "100.000+";
}

function plazoBanda(dias: number) {
  if (!dias && dias !== 0) return "A confirmar";
  if (dias < 15) return "0 – 15 días";
  if (dias < 30) return "15 – 30 días";
  if (dias < 60) return "30 – 60 días";
  if (dias < 90) return "60 – 90 días";
  if (dias < 120) return "90 – 120 días";
  return "120+ días";
}

export default function NuevaFacturaPage() {
  const [state, formAction, pending] = useActionState(
    crearFacturaAction,
    initialState,
  );
  const [monto, setMonto] = useState("");
  const [plazo, setPlazo] = useState("");
  const [moneda, setMoneda] = useState("USD");
  const [rubro, setRubro] = useState("fluvial");
  const [riesgo, setRiesgo] = useState("medio");

  const teaserPreview = useMemo(
    () => ({
      monto: montoBanda(Number(monto)),
      plazo: plazoBanda(Number(plazo)),
    }),
    [monto, plazo],
  );

  return (
    <div className="grid md:grid-cols-[1.4fr_1fr] gap-8">
      <div>
        <h1 className="text-2xl font-semibold mb-1">Cargar factura</h1>
        <p className="text-ink-soft text-sm mb-6">
          Es gratis, siempre. Los fondeadores solo ven un rango hasta que
          alguno gasta un crédito para ver el detalle completo.
        </p>
        <Card>
          <form action={formAction} className="flex flex-col gap-4" encType="multipart/form-data">
            <div className="grid grid-cols-2 gap-4">
              <Field label="Rubro">
                <Select
                  name="rubro"
                  value={rubro}
                  onChange={(e) => setRubro(e.target.value)}
                >
                  <option value="fluvial">Fluvial (barcaza/remolcador)</option>
                  <option value="camiones">Camiones</option>
                </Select>
              </Field>
              <Field label="Nº de factura (opcional)">
                <Input type="text" name="numero" />
              </Field>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Field label="Nombre del deudor">
                <Input type="text" name="deudor_nombre" required />
              </Field>
              <Field label="Contacto del deudor (opcional)">
                <Input type="text" name="deudor_contacto" />
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
                <Input type="date" name="fecha_vencimiento" />
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

            <Field label="Tu contacto para este flete (opcional)">
              <Input type="text" name="operador_contacto" placeholder="Teléfono o email — se muestra recién cuando un fondeador gasta un crédito" />
            </Field>

            <Field label="Descripción (opcional)">
              <Textarea name="descripcion" rows={3} placeholder="Ruta, tipo de carga, lo que ayude a evaluar la operación" />
            </Field>

            <Field label="Documento de la factura (foto o PDF, opcional)">
              <Input type="file" name="documento" accept="image/*,application/pdf" />
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
          Así la van a ver los fondeadores antes de gastar un crédito
        </p>
        <Card className="bg-surface-2 border-dashed">
          <div className="flex items-center gap-2 mb-3 flex-wrap">
            <span className="inline-block text-[.72rem] font-semibold px-2.5 py-1 rounded-full bg-surface text-ink-soft">
              {rubro === "fluvial" ? "Fluvial" : "Camiones"}
            </span>
            <span className="inline-block text-[.72rem] font-semibold px-2.5 py-1 rounded-full bg-surface text-ink-soft">
              {riesgo}
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-ink-soft text-xs uppercase tracking-wide">Monto</p>
              <p className="num font-medium">{moneda} {teaserPreview.monto}</p>
            </div>
            <div>
              <p className="text-ink-soft text-xs uppercase tracking-wide">Plazo</p>
              <p className="num font-medium">{teaserPreview.plazo}</p>
            </div>
            <div className="col-span-2">
              <p className="text-ink-soft text-xs uppercase tracking-wide">Deudor</p>
              <p className="font-medium">🔒 con 1 crédito</p>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

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
  const [monto, setMonto] = useState("");
  const [plazo, setPlazo] = useState("");
  const [moneda, setMoneda] = useState("USD");
  const [rubro, setRubro] = useState("");
  const [riesgo, setRiesgo] = useState("medio");

  const teaserPreview = useMemo(
    () => ({
      unlockFee: unlockFeePreview(Number(monto)),
    }),
    [monto],
  );

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

            <Field label="Tu contacto para esta factura (opcional)">
              <Input type="text" name="operador_contacto" placeholder="Teléfono o email — se muestra recién cuando el fondeador paga la tarifa de desbloqueo" />
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

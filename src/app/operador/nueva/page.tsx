"use client";

import { MontoInput } from "@/components/monto-input";
import { useActionState, useEffect, useState } from "react";
import { crearFacturaAction, previsualizarAlcanceAction, type FormState } from "../actions";
import { extraerDatosFacturaAction } from "../ocr";
import { Button, ErrorText, Field, Input, Select, Textarea } from "@/components/ui";
import { MONTO_MINIMO_USD, usd } from "@/lib/categorias";
import { CONSULTA_EKUATIA, leerCdc, normalizarCdc, rucBase } from "@/lib/cdc";
import type { Riesgo } from "@/lib/database.types";

const initialState: FormState = { error: null };

type Alcance = { montoUsd: number | null; instituciones: number; inversores: number };

function Check() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export default function NuevaFacturaPage() {
  const [state, formAction, pending] = useActionState(crearFacturaAction, initialState);
  const [numero, setNumero] = useState("");
  const [cdc, setCdc] = useState("");
  const [emisorRuc, setEmisorRuc] = useState("");
  const [deudorNombre, setDeudorNombre] = useState("");
  const [deudorRuc, setDeudorRuc] = useState("");
  const [deudorContacto, setDeudorContacto] = useState("");
  const [deudorTipo, setDeudorTipo] = useState<"privado" | "estado">("privado");
  const [monto, setMonto] = useState("");
  // Lo que leyó la IA del PDF (firmado por el servidor) y su monto, para
  // avisar si la PyME lo cambia: el fondeador ve esa diferencia.
  const [lectura, setLectura] = useState<string | null>(null);
  const [montoLeido, setMontoLeido] = useState<number | null>(null);
  const [avisoDeudor, setAvisoDeudor] = useState<string | null>(null);
  const [plazo, setPlazo] = useState("");
  const [moneda, setMoneda] = useState("USD");
  const [rubro, setRubro] = useState("");
  const [riesgo, setRiesgo] = useState<Riesgo>("medio");
  const [fechaVencimiento, setFechaVencimiento] = useState("");
  const [descripcion, setDescripcion] = useState("");

  const [documento, setDocumento] = useState<File | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [ocrError, setOcrError] = useState<string | null>(null);
  const [ocrApplied, setOcrApplied] = useState(false);
  const [alcance, setAlcance] = useState<Alcance | null>(null);

  // Vista previa del alcance (con una pausa para no consultar en cada tecla).
  useEffect(() => {
    const m = Number(monto);
    if (!m || m <= 0) return;
    let vigente = true;
    const t = setTimeout(async () => {
      const r = await previsualizarAlcanceAction({
        monto: m,
        moneda,
        plazo_dias: Number(plazo) || 0,
        riesgo,
        deudor_tipo: deudorTipo,
        rubro,
      });
      if (vigente) setAlcance(r);
    }, 500);
    return () => {
      vigente = false;
      clearTimeout(t);
    };
  }, [monto, moneda, plazo, riesgo, deudorTipo, rubro]);

  const montoNum = Number(monto);
  const montoUsd = !montoNum ? null : moneda === "USD" ? montoNum : alcance?.montoUsd ?? null;
  const bajoMinimo = montoUsd != null && montoUsd < MONTO_MINIMO_USD;
  const totalAlcance = alcance ? alcance.instituciones + alcance.inversores : null;

  // Controles del CDC en vivo (la base los vuelve a calcular al guardar).
  const cdcLimpio = normalizarCdc(cdc);
  const infoCdc = leerCdc(cdcLimpio);
  const rucOk = infoCdc && rucBase(emisorRuc) ? rucBase(emisorRuc) === infoCdc.ruc : null;
  const numeroOk =
    infoCdc && /^\d+-\d+-\d+$/.test(numero.trim())
      ? numero.trim().split("-").map((p) => p.replace(/^0+/, "")).join("-") ===
        infoCdc.numero.split("-").map((p) => p.replace(/^0+/, "")).join("-")
      : null;

  async function handleExtraer(file: File) {
    setOcrLoading(true);
    setOcrError(null);
    const fd = new FormData();
    fd.set("documento", file);
    const result = await extraerDatosFacturaAction(fd);
    setOcrLoading(false);

    if (!result.data) {
      setOcrError(result.error ?? "No se pudo leer el documento.");
      return;
    }

    const d = result.data;
    setLectura(result.lectura ?? null);
    setAvisoDeudor(result.avisoDeudor ?? null);
    if (result.avisoDeudor) {
      setDeudorNombre("");
      setDeudorRuc("");
      setDeudorContacto("");
    }
    const leido = d.monto ? Number(String(d.monto).replace(/[^0-9.]/g, "")) : NaN;
    setMontoLeido(Number.isFinite(leido) && leido > 0 ? leido : null);
    if (d.cdc) setCdc(normalizarCdc(d.cdc));
    if (d.emisor_ruc) setEmisorRuc(d.emisor_ruc);
    if (d.deudor_ruc) setDeudorRuc(d.deudor_ruc);
    if (d.deudor_nombre) setDeudorNombre(d.deudor_nombre);
    if (d.deudor_contacto) setDeudorContacto(d.deudor_contacto);
    if (d.monto) setMonto(d.monto);
    if (d.moneda === "USD" || d.moneda === "PYG") setMoneda(d.moneda);
    if (d.numero) setNumero(d.numero);
    if (d.descripcion) setDescripcion(d.descripcion);
    if (d.fecha_vencimiento) {
      setFechaVencimiento(d.fecha_vencimiento);
      const dias = Math.round((new Date(d.fecha_vencimiento).getTime() - Date.now()) / 86400000);
      if (Number.isFinite(dias)) setPlazo(String(Math.max(0, dias)));
    }
    setOcrApplied(true);
  }

  return (
    <div className="grid lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)] gap-8 items-start">
      <div>
        <h1 className="text-[1.75rem] md:text-3xl font-bold leading-tight">Subir factura</h1>
        <p className="text-ink-soft mt-1.5 mb-6">
          Siempre gratis. Sacale una foto o subí el PDF y la IA completa los datos por vos.
        </p>

        <form action={formAction} className="flex flex-col gap-4" encType="multipart/form-data">
          {lectura && <input type="hidden" name="lectura" value={lectura} />}
          <section className="bg-surface border border-line rounded-3xl p-5 flex flex-col gap-3">
            <label
              className={`rounded-2xl border-2 border-dashed transition px-4 py-6 flex flex-col items-center gap-2 cursor-pointer text-center ${
                documento ? "border-accent bg-accent-soft/40" : "border-line-strong hover:border-accent"
              }`}
            >
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-accent">
                <path d="M4 7h3l2-3h6l2 3h3v12H4z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
              <span className="font-semibold">{documento ? documento.name : "Foto o PDF de la factura"}</span>
              <span className="text-xs text-ink-soft">
                {documento ? "Tocá para cambiarla" : "La IA lee el deudor, el monto y el vencimiento"}
              </span>
              <input
                type="file"
                name="documento"
                accept="image/*,application/pdf"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0] ?? null;
                  setDocumento(f);
                  setOcrError(null);
                  setOcrApplied(false);
                  if (f) handleExtraer(f);
                }}
              />
            </label>
            {ocrLoading && (
              <p role="status" className="flex items-center gap-2.5 text-sm text-ink-soft">
                <span className="h-4 w-4 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
                Leyendo la factura… puede tardar unos segundos.
              </p>
            )}
            {ocrApplied && (
              <p className="flex items-center gap-2 text-sm font-semibold text-accent">
                <Check /> Datos leídos automáticamente. Revisalos antes de publicar.
              </p>
            )}
            {ocrError && <ErrorText>{ocrError}</ErrorText>}
          </section>

          <section className="bg-surface border border-line rounded-3xl p-5 flex flex-col gap-4">
            <div>
              <p className="font-bold">Factura electrónica</p>
              <p className="text-sm text-ink-soft">
                El CDC son los 44 números debajo del QR. Con él los fondeadores verifican que la factura exista.
              </p>
            </div>
            <Field label="CDC (código de control)">
              <Input
                type="text"
                name="cdc"
                inputMode="numeric"
                autoComplete="off"
                placeholder="0180 0695 6310 0100 1000 …"
                value={cdc}
                onChange={(e) => setCdc(e.target.value)}
                className="num tracking-wide"
                aria-invalid={(cdcLimpio.length === 44 && infoCdc && !infoCdc.valido) || undefined}
              />
            </Field>
            {cdcLimpio.length > 0 && (
              <ul className="flex flex-col gap-1.5 text-sm -mt-1">
                {cdcLimpio.length !== 44 ? (
                  <li className="text-ink-soft">{cdcLimpio.length} de 44 dígitos</li>
                ) : infoCdc && infoCdc.valido ? (
                  <>
                    <li className="flex items-center gap-2 font-semibold text-accent"><Check /> Código válido{infoCdc.esFactura ? " · factura electrónica" : ""}</li>
                    {rucOk === true && <li className="flex items-center gap-2 font-semibold text-accent"><Check /> Coincide con tu RUC</li>}
                    {rucOk === false && <li className="font-semibold text-critical">El RUC del código ({infoCdc.ruc}) no coincide con el que pusiste como emisor.</li>}
                    {numeroOk === true && <li className="flex items-center gap-2 font-semibold text-accent"><Check /> Coincide con el número de factura</li>}
                    {numeroOk === false && <li className="font-semibold text-warn">El número de factura no coincide con el del código ({infoCdc.numero}).</li>}
                  </>
                ) : (
                  <li className="font-semibold text-critical">El código no es válido. Revisá que esté bien copiado.</li>
                )}
              </ul>
            )}
            <Field label="RUC de tu empresa (quien emite la factura)">
              <Input type="text" name="emisor_ruc" placeholder="80012345-6" value={emisorRuc} onChange={(e) => setEmisorRuc(e.target.value)} />
            </Field>
            <a href={CONSULTA_EKUATIA} target="_blank" rel="noreferrer" className="text-sm font-semibold self-start">
              ¿Dónde encuentro el CDC? Consultalo en e-Kuatia →
            </a>
          </section>

          <section className="bg-surface border border-line rounded-3xl p-5 flex flex-col gap-4">
            <Field label="Deudor (quién te debe)">
              <Input
                type="text"
                name="deudor_nombre"
                required
                value={deudorNombre}
                onChange={(e) => {
                  setDeudorNombre(e.target.value);
                  if (avisoDeudor) setAvisoDeudor(null);
                }}
                placeholder="Tu cliente: la empresa o persona que te tiene que pagar"
                className={avisoDeudor ? "!border-warn" : ""}
              />
            </Field>
            {avisoDeudor && (
              <p className="text-sm text-warn bg-warn-soft rounded-xl px-3.5 py-2.5 -mt-2">{avisoDeudor}</p>
            )}
            <div role="radiogroup" aria-label="Tipo de deudor" className="grid grid-cols-2 gap-1.5 bg-surface-3 rounded-2xl p-1.5">
              {(["privado", "estado"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={deudorTipo === t}
                  onClick={() => setDeudorTipo(t)}
                  className={`min-h-11 rounded-xl text-sm font-semibold transition ${
                    deudorTipo === t ? "bg-surface text-ink shadow-sm" : "text-ink-soft"
                  }`}
                >
                  {t === "privado" ? "Empresa privada" : "Institución del Estado"}
                </button>
              ))}
            </div>
            <input type="hidden" name="deudor_tipo" value={deudorTipo} />
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="RUC del deudor (opcional)">
                <Input type="text" name="deudor_ruc" placeholder="80012345-6" value={deudorRuc} onChange={(e) => setDeudorRuc(e.target.value)} />
              </Field>
              <Field label="N.º de factura (opcional)">
                <Input type="text" name="numero" value={numero} onChange={(e) => setNumero(e.target.value)} />
              </Field>
            </div>
            <Field label="Contacto del deudor (opcional)">
              <Input type="text" name="deudor_contacto" value={deudorContacto} onChange={(e) => setDeudorContacto(e.target.value)} />
            </Field>
          </section>

          <section className="bg-surface border border-line rounded-3xl p-5 flex flex-col gap-4">
            <div className="grid grid-cols-[minmax(0,1fr)_110px] gap-3">
              <Field label="Monto">
                <MontoInput
                  name="monto"
                  decimales={moneda === "USD" ? 2 : 0}
                  required
                  value={monto}
                  onChange={setMonto}
                  className={bajoMinimo ? "!border-critical" : ""}
                  invalido={bajoMinimo}
                />
              </Field>
              <Field label="Moneda">
                <Select name="moneda" value={moneda} onChange={(e) => setMoneda(e.target.value)}>
                  <option value="USD">USD</option>
                  <option value="PYG">PYG</option>
                </Select>
              </Field>
            </div>
            {montoUsd != null && (
              <p className={`text-sm font-semibold flex items-center gap-2 -mt-1 ${bajoMinimo ? "text-critical" : "text-accent"}`}>
                {bajoMinimo ? (
                  `El mínimo para publicar es ${usd(MONTO_MINIMO_USD)}${moneda !== "USD" ? " o su equivalente" : ""}.`
                ) : (
                  <>
                    <Check /> Supera el mínimo de la plataforma ({usd(MONTO_MINIMO_USD)})
                  </>
                )}
              </p>
            )}
            {montoLeido != null && Number(monto) > 0 && Math.abs(Number(monto) - montoLeido) > Math.max(1, montoLeido * 0.005) && (
              <p className="text-sm text-warn bg-warn-soft rounded-xl px-3.5 py-2.5">
                En el documento la IA leyó <strong className="num">{montoLeido.toLocaleString("es-PY")}</strong>. Si publicás
                otro monto, los fondeadores van a ver el aviso «El monto no coincide con el de la factura».
              </p>
            )}
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Vencimiento de la factura">
                <Input
                  type="date"
                  name="fecha_vencimiento"
                  required
                  min={new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(new Date())}
                  value={fechaVencimiento}
                  onChange={(e) => {
                    setFechaVencimiento(e.target.value);
                    const dias = Math.round((new Date(e.target.value).getTime() - Date.now()) / 86400000);
                    if (Number.isFinite(dias)) setPlazo(String(Math.max(0, dias)));
                  }}
                />
              </Field>
              <Field label="Días hasta el cobro">
                <Input type="number" name="plazo_dias" min="0" required value={plazo} onChange={(e) => setPlazo(e.target.value)} />
              </Field>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Rubro">
                <Input
                  type="text"
                  name="rubro"
                  list="rubro-sugerencias"
                  placeholder="Ej: camiones, fluvial, comercio…"
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
              <Field label="Riesgo (tu evaluación)">
                <Select name="riesgo" value={riesgo} onChange={(e) => setRiesgo(e.target.value as Riesgo)}>
                  <option value="bajo">Bajo</option>
                  <option value="medio">Medio</option>
                  <option value="alto">Alto</option>
                </Select>
              </Field>
            </div>
            <Field label="Descripción (opcional)">
              <Textarea
                name="descripcion"
                rows={3}
                placeholder="Qué servicio o producto se facturó. Sin teléfonos ni emails."
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </Field>
            <Field label="Tu contacto para esta factura (opcional)" hint="Se comparte recién cuando se cierra el acuerdo.">
              <Input type="text" name="operador_contacto" placeholder="Teléfono o email" />
            </Field>
          </section>

          <ErrorText>{state.error}</ErrorText>
          <Button type="submit" disabled={pending || bajoMinimo} className="w-full !min-h-13 text-base">
            {pending ? "Publicando…" : "Publicar factura"}
          </Button>
        </form>
      </div>

      <aside className="lg:sticky lg:top-24 flex flex-col gap-4">
        <section className="rounded-3xl bg-ink text-white p-5 flex flex-col gap-4">
          <p className="text-sm text-[#c9d2dd] font-medium">Tu factura encaja con</p>
          <div className="grid grid-cols-2 gap-2.5">
            <div className="rounded-2xl bg-white/10 px-4 py-3">
              <p className="num text-3xl font-bold text-white">{alcance && montoNum ? alcance.instituciones : "—"}</p>
              <p className="text-sm text-[#dce3eb]">instituciones</p>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3">
              <p className="num text-3xl font-bold text-white">{alcance && montoNum ? alcance.inversores : "—"}</p>
              <p className="text-sm text-[#dce3eb]">inversores</p>
            </div>
          </div>
          <p className="text-[13px] text-[#c9d2dd] leading-snug">
            {!montoNum
              ? "Completá el monto para ver cuántos fondeadores verificados buscan facturas como la tuya."
              : totalAlcance === 0
                ? "Hoy ningún fondeador busca exactamente esto, pero la factura queda publicada y les avisamos cuando cambien sus preferencias."
                : "Les avisamos apenas publiques. Tu nombre y el del deudor solo los ve quien marque interés."}
          </p>
        </section>

        <section className="bg-surface border border-line rounded-3xl p-5 flex flex-col gap-3">
          <p className="font-bold">Así la ven los fondeadores</p>
          <div className="flex gap-1.5 flex-wrap">
            <span className="text-xs font-semibold bg-slate-soft text-slate-ink px-2.5 py-1 rounded-full">{rubro || "Rubro"}</span>
            <span className="text-xs font-semibold bg-slate-soft text-slate-ink px-2.5 py-1 rounded-full">
              {deudorTipo === "estado" ? "Deudor: Estado" : "Empresa privada"}
            </span>
          </div>
          <p className="num text-2xl font-semibold">{montoNum ? `${moneda} ${montoNum.toLocaleString("es-PY")}` : "Monto"}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-surface-2 rounded-xl px-3 py-2">
              <p className="text-[11px] text-ink-soft">Plazo</p>
              <p className="text-sm font-semibold">{plazo ? `${plazo} días` : "—"}</p>
            </div>
            <div className="bg-surface-2 rounded-xl px-3 py-2">
              <p className="text-[11px] text-ink-soft">Riesgo</p>
              <p className="text-sm font-semibold capitalize">{riesgo}</p>
            </div>
          </div>
          <p className="text-xs text-ink-soft">El nombre del deudor y el documento se muestran solo a quien marque «Me interesa».</p>
        </section>
      </aside>
    </div>
  );
}

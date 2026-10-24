"use client";

import { useActionState } from "react";
import Link from "next/link";
import { guardarPreferenciasAction } from "../actions";
import { Button, ErrorText } from "@/components/ui";
import {
  CATEGORIA_LABEL,
  DEUDOR_TIPO_LABEL,
  RANGO_CATEGORIA,
  RIESGOS,
  usd,
} from "@/lib/categorias";
import { RIESGO_LABEL } from "@/lib/format";
import type { FondeadorPerfil, Industry } from "@/lib/database.types";

const PLAZOS: { v: string; label: string }[] = [
  { v: "30", label: "30 d" },
  { v: "60", label: "60 d" },
  { v: "90", label: "90 d" },
  { v: "120", label: "120 d" },
  { v: "180", label: "180 d" },
  { v: "", label: "Sin límite" },
];

const chip =
  "inline-flex items-center gap-2 min-h-11 px-4 rounded-full border-[1.5px] text-sm font-semibold cursor-pointer select-none transition " +
  "border-line-strong bg-surface text-slate-ink hover:border-ink-soft " +
  "has-[:checked]:border-accent has-[:checked]:bg-accent-soft has-[:checked]:text-accent " +
  "has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-accent-soft";

function Seccion({ titulo, children, extra }: { titulo: string; children: React.ReactNode; extra?: React.ReactNode }) {
  return (
    <section className="bg-surface border border-line rounded-3xl p-5 flex flex-col gap-3.5">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-base font-bold font-sans tracking-normal">{titulo}</h2>
        {extra}
      </div>
      {children}
    </section>
  );
}

export function PreferenciasForm({
  perfil,
  industrias,
}: {
  perfil: FondeadorPerfil;
  industrias: Industry[];
}) {
  const [state, action, pending] = useActionState(guardarPreferenciasAction, { error: null });
  const categoria = perfil.categoria!;
  const base = RANGO_CATEGORIA[categoria];
  const plazoActual = perfil.plazo_max_dias == null ? "" : String(perfil.plazo_max_dias);
  const padres = industrias.filter((i) => !i.parent_id);
  const hijos = (id: string) => industrias.filter((i) => i.parent_id === id);
  const primeraVez = perfil.monto_min_usd == null;

  return (
    <form action={action} className="flex flex-col gap-4 pb-4">
      <div className="mb-2">
        <h1 className="text-[1.75rem] md:text-3xl font-bold leading-tight">¿Qué facturas querés ver?</h1>
        <p className="text-ink-soft mt-1.5 flex items-center gap-2 flex-wrap">
          <span className="inline-flex items-center gap-1.5 text-sm font-semibold text-accent bg-accent-soft px-2.5 py-1 rounded-full">
            {CATEGORIA_LABEL[categoria]}
          </span>
          <span className="text-sm">
            Tu rango base: {base.max == null ? `desde ${usd(base.min)}` : `${usd(base.min)} a ${usd(base.max)}`} ·{" "}
            <Link href="/fondeador/verificacion" className="font-semibold">Cambiar categoría</Link>
          </span>
        </p>
      </div>

      <Seccion titulo="Monto por factura (USD)">
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-ink-soft font-medium">Desde</span>
            <input
              name="monto_min_usd"
              inputMode="numeric"
              defaultValue={String(perfil.monto_min_usd ?? base.min)}
              className="min-h-12 rounded-xl border border-line-strong px-3.5 text-base font-semibold outline-none focus:border-accent focus:ring-4 focus:ring-accent-soft"
              required
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="text-ink-soft font-medium">Hasta {base.max == null && <span className="font-normal">(vacío = sin tope)</span>}</span>
            <input
              name="monto_max_usd"
              inputMode="numeric"
              defaultValue={perfil.monto_max_usd != null ? String(perfil.monto_max_usd) : base.max != null ? String(base.max) : ""}
              className="min-h-12 rounded-xl border border-line-strong px-3.5 text-base font-semibold outline-none focus:border-accent focus:ring-4 focus:ring-accent-soft"
              required={base.max != null}
            />
          </label>
        </div>
      </Seccion>

      <Seccion titulo="Plazo máximo">
        <div role="radiogroup" aria-label="Plazo máximo" className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 bg-surface-3 rounded-2xl p-1.5">
          {PLAZOS.map((p) => (
            <label
              key={p.v || "sin"}
              className="min-h-11 rounded-xl flex items-center justify-center text-sm font-semibold text-ink-soft cursor-pointer transition has-[:checked]:bg-surface has-[:checked]:text-ink has-[:checked]:shadow-sm has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent"
            >
              <input type="radio" name="plazo_max_dias" value={p.v} defaultChecked={plazoActual === p.v} className="sr-only" />
              {p.label}
            </label>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Riesgo y tipo de deudor">
        <div className="flex flex-wrap gap-2">
          {RIESGOS.map((r) => (
            <label key={r} className={chip}>
              <input type="checkbox" name="riesgos" value={r} defaultChecked={perfil.riesgos.includes(r)} className="sr-only" />
              {RIESGO_LABEL[r]}
            </label>
          ))}
        </div>
        <div className="h-px bg-line" />
        <div className="flex flex-wrap gap-2">
          {(["privado", "estado"] as const).map((t) => (
            <label key={t} className={chip}>
              <input type="checkbox" name="deudor_tipos" value={t} defaultChecked={perfil.deudor_tipos.includes(t)} className="sr-only" />
              {DEUDOR_TIPO_LABEL[t]}
            </label>
          ))}
        </div>
      </Seccion>

      <Seccion titulo="Rubros" extra={<span className="text-xs text-ink-soft">Sin marcar = todos</span>}>
        <div className="flex flex-wrap gap-2">
          {padres.map((p) => (
            <span key={p.id} className="contents">
              <label className={chip}>
                <input type="checkbox" name="industrias" value={p.id} defaultChecked={perfil.industrias.includes(p.id)} className="sr-only" />
                {p.nombre}
              </label>
              {hijos(p.id).map((h) => (
                <label key={h.id} className={chip}>
                  <input type="checkbox" name="industrias" value={h.id} defaultChecked={perfil.industrias.includes(h.id)} className="sr-only" />
                  {h.nombre}
                </label>
              ))}
            </span>
          ))}
        </div>
      </Seccion>

      <section className="bg-surface border border-line rounded-3xl p-5 flex items-center gap-4">
        <div className="flex-1">
          <p className="font-bold">Avisame cuando haya match</p>
          <p className="text-sm text-ink-soft">Te llega un aviso cuando entra una factura que encaja con todo esto.</p>
        </div>
        <label className="relative w-13 h-8 shrink-0 cursor-pointer">
          <input type="checkbox" role="switch" name="alertas" defaultChecked={perfil.alertas} className="peer sr-only" aria-label="Avisos de match" />
          <span aria-hidden="true" className="absolute inset-0 rounded-full bg-line-strong transition peer-checked:bg-accent peer-focus-visible:ring-4 peer-focus-visible:ring-accent-soft" />
          <span aria-hidden="true" className="absolute top-1 left-1 w-6 h-6 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
        </label>
      </section>

      {primeraVez && <input type="hidden" name="volver" value="feed" />}

      <div className="sticky bottom-20 md:bottom-4 z-10 flex flex-col gap-2 bg-background/90 backdrop-blur rounded-3xl p-2 -mx-2">
        <ErrorText>{state.error}</ErrorText>
        {state.ok && !state.error && (
          <p role="status" className="text-sm text-good bg-good-soft rounded-xl px-3.5 py-2.5 font-semibold">
            Listo, guardamos tus preferencias.
          </p>
        )}
        <Button type="submit" disabled={pending} className="w-full !min-h-13 text-base">
          {pending ? "Guardando…" : primeraVez ? "Guardar y ver facturas" : "Guardar preferencias"}
        </Button>
      </div>
    </form>
  );
}

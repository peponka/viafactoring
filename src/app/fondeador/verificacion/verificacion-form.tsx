"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { enviarVerificacionAction } from "../actions";
import { Button, ErrorText } from "@/components/ui";
import { RANGO_CATEGORIA, rangoTexto } from "@/lib/categorias";
import type { CategoriaFondeador } from "@/lib/database.types";

const PERSONA = (
  <>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0 1 16 0" />
  </>
);
const MALETIN = (
  <>
    <rect x="3" y="7" width="18" height="13" rx="2" />
    <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" />
  </>
);
const SOCIOS = (
  <>
    <circle cx="9" cy="8" r="3.2" />
    <circle cx="17" cy="9" r="2.6" />
    <path d="M3 20a6 6 0 0 1 12 0M14.5 15.2A5 5 0 0 1 21 20" />
  </>
);
const MONEDA = (
  <>
    <circle cx="12" cy="12" r="9" />
    <path d="M14.8 9.2c-.5-.8-1.5-1.3-2.8-1.3-1.7 0-2.8.9-2.8 2.1 0 2.9 5.8 1.4 5.8 4.3 0 1.2-1.2 2.1-3 2.1-1.4 0-2.5-.6-3-1.5M12 6.5v1.4M12 16.4v1.4" />
  </>
);
const BANCO = (
  <>
    <path d="M3 21h18M4 10h16M12 3l9 7H3z" />
    <path d="M6 10v8M10 10v8M14 10v8M18 10v8" />
  </>
);
const GRAFICO = (
  <>
    <path d="M3 3v18h18" />
    <path d="m7 15 4-4 3 3 5-6" />
  </>
);

const OPCIONES: {
  value: CategoriaFondeador;
  titulo: string;
  sub: string;
  requisitos: string;
  documentos: string;
  icono: React.ReactNode;
}[] = [
  {
    value: "individual",
    titulo: "Inversor individual",
    sub: "Persona con capital propio",
    requisitos: "Cédula + RUC",
    documentos: "Foto o PDF de tu cédula y constancia de RUC.",
    icono: PERSONA,
  },
  {
    value: "empresa",
    titulo: "Empresa o family office",
    sub: "Empresa que invierte su excedente",
    requisitos: "RUC + estatuto",
    documentos: "Constancia de RUC de la empresa, estatuto o acta de constitución y cédula del representante.",
    icono: MALETIN,
  },
  {
    value: "cooperativa",
    titulo: "Cooperativa",
    sub: "Cooperativa de ahorro y crédito",
    requisitos: "RUC + Incoop",
    documentos: "Constancia de RUC y registro vigente ante el Incoop.",
    icono: SOCIOS,
  },
  {
    value: "financiera",
    titulo: "Financiera",
    sub: "Entidad financiera o de factoring",
    requisitos: "RUC + registro BCP",
    documentos: "Constancia de RUC y autorización o registro ante el BCP.",
    icono: MONEDA,
  },
  {
    value: "banco",
    titulo: "Banco",
    sub: "Banco habilitado en Paraguay",
    requisitos: "RUC + licencia BCP",
    documentos: "Constancia de RUC y licencia bancaria del BCP. Puede ser una carta de la gerencia que autoriza al usuario.",
    icono: BANCO,
  },
  {
    value: "fondo",
    titulo: "Fondo o casa de bolsa",
    sub: "Fondo de inversión o casa de bolsa",
    requisitos: "RUC + registro de valores",
    documentos: "Constancia de RUC y registro ante la Superintendencia de Valores del BCP.",
    icono: GRAFICO,
  },
];

const MAX_MB = 10;

export function VerificacionForm({
  userId,
  categoriaActual,
}: {
  userId: string;
  categoriaActual: CategoriaFondeador | null;
}) {
  const [categoria, setCategoria] = useState<CategoriaFondeador>(categoriaActual ?? "individual");
  const [archivos, setArchivos] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function agregar(lista: FileList | null) {
    if (!lista) return;
    const nuevos = Array.from(lista).filter((f) => f.size <= MAX_MB * 1024 * 1024);
    if (nuevos.length < lista.length) setError(`Cada archivo puede pesar hasta ${MAX_MB} MB.`);
    else setError(null);
    setArchivos((prev) => [...prev, ...nuevos].slice(0, 5));
  }

  async function enviar() {
    setError(null);
    if (archivos.length === 0) return setError("Subí al menos un documento.");
    setSubiendo(true);
    const supabase = createClient();
    const rutas: string[] = [];
    for (const f of archivos) {
      const limpio = f.name.normalize("NFD").replace(/[^\w.-]+/g, "_").slice(-80);
      const ruta = `${userId}/${Date.now()}-${limpio}`;
      const { error: e } = await supabase.storage.from("verificaciones").upload(ruta, f, { upsert: false });
      if (e) {
        setSubiendo(false);
        return setError("No pudimos subir uno de los archivos. Probá de nuevo.");
      }
      rutas.push(ruta);
    }
    setSubiendo(false);
    startTransition(async () => {
      const r = await enviarVerificacionAction(categoria, rutas);
      if (r.error) return setError(r.error);
      router.refresh();
    });
  }

  const ocupado = subiendo || pending;

  return (
    <div className="flex flex-col gap-5">
      <div role="radiogroup" aria-label="Categoría de fondeador" className="flex flex-col gap-2">
        {OPCIONES.map((o) => {
          const activa = categoria === o.value;
          const r = RANGO_CATEGORIA[o.value];
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={activa}
              onClick={() => setCategoria(o.value)}
              className={`text-left rounded-2xl px-4 py-3.5 border-2 bg-surface transition grid grid-cols-[2.75rem_1fr_auto] sm:grid-cols-[2.75rem_1fr_11rem_auto] items-center gap-x-4 gap-y-1 ${
                activa ? "border-accent shadow-[0_8px_24px_rgb(11_110_79_/_0.12)]" : "border-line hover:border-line-strong"
              }`}
            >
              <span className={`w-11 h-11 rounded-xl flex items-center justify-center ${activa ? "bg-accent-soft text-accent" : "bg-slate-soft text-slate-ink"}`}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  {o.icono}
                </svg>
              </span>
              <span className="min-w-0">
                <span className="block font-bold">{o.titulo}</span>
                <span className="block text-sm text-ink-soft">{o.sub}</span>
                <span className="sm:hidden block text-sm mt-1">
                  <span className="font-semibold num">{rangoTexto(r.min, r.max)}</span>
                  <span className="text-ink-soft"> · {o.requisitos}</span>
                </span>
              </span>
              <span className="hidden sm:block text-sm">
                <span className="block font-semibold num">{rangoTexto(r.min, r.max)}</span>
                <span className="block text-ink-soft">{o.requisitos}</span>
              </span>
              <span
                aria-hidden="true"
                className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${activa ? "border-accent" : "border-line-strong"}`}
              >
                {activa && <span className="w-2.5 h-2.5 rounded-full bg-accent" />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="bg-surface border border-line rounded-3xl p-5 flex flex-col gap-3">
        <p className="font-semibold">Documentación</p>
        <p className="text-sm text-ink-soft -mt-2">
          {OPCIONES.find((o) => o.value === categoria)?.documentos}
        </p>
        <label className="rounded-2xl border-2 border-dashed border-line-strong hover:border-accent transition px-4 py-6 flex flex-col items-center gap-2 cursor-pointer text-center">
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-accent">
            <path d="M12 16V4M7 9l5-5 5 5" />
            <path d="M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
          </svg>
          <span className="text-sm font-semibold">Elegir archivos</span>
          <span className="text-xs text-ink-soft">Fotos o PDF, hasta {MAX_MB} MB cada uno</span>
          <input
            type="file"
            multiple
            accept="image/*,application/pdf"
            className="sr-only"
            onChange={(e) => agregar(e.target.files)}
          />
        </label>
        {archivos.length > 0 && (
          <ul className="flex flex-col gap-2">
            {archivos.map((f, i) => (
              <li key={i} className="flex items-center justify-between gap-3 bg-surface-2 rounded-xl px-3 py-2 text-sm">
                <span className="truncate">{f.name}</span>
                <button
                  type="button"
                  onClick={() => setArchivos((prev) => prev.filter((_, j) => j !== i))}
                  className="text-ink-soft hover:text-critical font-semibold min-h-9 px-2"
                  aria-label={`Quitar ${f.name}`}
                >
                  Quitar
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex gap-3 items-start rounded-2xl bg-slate-soft px-4 py-3.5 text-sm text-slate-ink">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 mt-0.5">
          <circle cx="12" cy="12" r="9" />
          <path d="M12 8h.01M11 12h1v5h1" />
        </svg>
        <p>Revisamos tus documentos a mano. Te avisamos cuando tu cuenta esté aprobada y empezás a ver facturas.</p>
      </div>

      <ErrorText>{error}</ErrorText>
      <Button onClick={enviar} disabled={ocupado} className="w-full !min-h-13 text-base">
        {subiendo ? "Subiendo documentos…" : pending ? "Enviando…" : "Enviar a revisión"}
      </Button>
      <p className="text-xs text-ink-soft text-center">
        ViaFactoring es una plataforma de información. No es entidad financiera, no presta ni administra fondos.
      </p>
    </div>
  );
}

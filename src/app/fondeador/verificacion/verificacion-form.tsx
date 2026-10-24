"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { enviarVerificacionAction } from "../actions";
import { Button, ErrorText } from "@/components/ui";
import { RANGO_CATEGORIA, rangoTexto } from "@/lib/categorias";
import type { CategoriaFondeador } from "@/lib/database.types";

const OPCIONES: {
  value: CategoriaFondeador;
  titulo: string;
  sub: string;
  requisitos: string;
  icono: React.ReactNode;
}[] = [
  {
    value: "individual",
    titulo: "Inversor individual",
    sub: "Persona con capital propio",
    requisitos: "Cédula + RUC",
    icono: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21a8 8 0 0 1 16 0" />
      </>
    ),
  },
  {
    value: "institucion",
    titulo: "Institución financiera",
    sub: "Banco, financiera, cooperativa o fondo",
    requisitos: "RUC + registro BCP o Incoop",
    icono: (
      <>
        <path d="M3 21h18M4 10h16M12 3l9 7H3z" />
        <path d="M6 10v8M10 10v8M14 10v8M18 10v8" />
      </>
    ),
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
      <div role="radiogroup" aria-label="Categoría de fondeador" className="grid gap-3 sm:grid-cols-2">
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
              className={`text-left rounded-3xl p-5 border-2 bg-surface transition flex flex-col gap-4 ${
                activa ? "border-accent shadow-[0_8px_24px_rgb(11_110_79_/_0.12)]" : "border-line hover:border-line-strong"
              }`}
            >
              <div className="flex items-center gap-3">
                <span className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 ${activa ? "bg-accent-soft text-accent" : "bg-slate-soft text-slate-ink"}`}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {o.icono}
                  </svg>
                </span>
                <span className="flex-1">
                  <span className="block font-bold">{o.titulo}</span>
                  <span className="block text-sm text-ink-soft">{o.sub}</span>
                </span>
                <span
                  aria-hidden="true"
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${activa ? "border-accent" : "border-line-strong"}`}
                >
                  {activa && <span className="w-2.5 h-2.5 rounded-full bg-accent" />}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <span className="bg-surface-2 rounded-xl px-3 py-2">
                  <span className="block text-[11px] text-ink-soft">Facturas</span>
                  <span className="block text-sm font-semibold">{rangoTexto(r.min, r.max)}</span>
                </span>
                <span className="bg-surface-2 rounded-xl px-3 py-2">
                  <span className="block text-[11px] text-ink-soft">Necesitás</span>
                  <span className="block text-sm font-semibold">{o.requisitos}</span>
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <div className="bg-surface border border-line rounded-3xl p-5 flex flex-col gap-3">
        <p className="font-semibold">Documentación</p>
        <p className="text-sm text-ink-soft -mt-2">
          {categoria === "individual"
            ? "Foto o PDF de tu cédula y constancia de RUC."
            : "Constancia de RUC de la empresa y registro ante el BCP o el Incoop."}
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
        ViaFactoring es una plataforma tecnológica que conecta partes. No es entidad financiera ni administra fondos.
      </p>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { investigarAction, reintentarInvestigacionAction } from "../actions";
import { CONSULTA_EKUATIA, formatearCdc } from "@/lib/cdc";
import type { FichaVerificacion as Ficha, Investigacion } from "@/lib/database.types";

type Estado = "ok" | "alerta" | "info" | "pendiente";

function Marca({ estado }: { estado: Estado }) {
  const estilos: Record<Estado, string> = {
    ok: "bg-accent text-white",
    alerta: "bg-critical text-white",
    info: "bg-slate-soft text-slate-ink",
    pendiente: "bg-gold-soft text-gold",
  };
  return (
    <span className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5 ${estilos[estado]}`} aria-hidden="true">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        {estado === "ok" && <path d="M20 6 9 17l-5-5" />}
        {estado === "alerta" && <path d="M12 7v6M12 17h.01" />}
        {estado === "info" && <path d="M12 8h.01M12 12v5" />}
        {estado === "pendiente" && <path d="M12 7v5l3 2" />}
      </svg>
    </span>
  );
}

function Linea({ estado, children }: { estado: Estado; children: React.ReactNode }) {
  const etiqueta = { ok: "Verificado", alerta: "Atención", info: "Dato", pendiente: "Sin verificar" }[estado];
  return (
    <li className="flex gap-2.5 text-sm leading-snug">
      <Marca estado={estado} />
      <span>
        <span className="sr-only">{etiqueta}: </span>
        {children}
      </span>
    </li>
  );
}

function controles(f: Ficha) {
  const v = f.verificacion ?? {};
  const items: { estado: Estado; texto: string }[] = [];
  // Monto publicado vs. el que la IA leyó del documento (aplica con o sin CDC).
  if (v.monto_coincide === false) {
    items.push({
      estado: "alerta",
      texto: `El monto no coincide con el de la factura: en el documento dice ${
        v.monto_leido != null ? `${v.moneda_leida ?? ""} ${Number(v.monto_leido).toLocaleString("es-PY")}`.trim() : "otro monto"
      }.`,
    });
  } else if (v.monto_coincide === true) {
    items.push({ estado: "ok", texto: "El monto coincide con el que dice la factura" });
  }
  if (!v.cdc_presente) {
    items.push({ estado: "info", texto: "La pyme no cargó el código de control (CDC) de la factura electrónica." });
    return items;
  }
  items.push(
    v.cdc_dv_ok
      ? { estado: "ok", texto: `Código de control válido${v.es_factura ? " (factura electrónica)" : ""}` }
      : { estado: "alerta", texto: "El código de control no es válido" },
  );
  if (v.ruc_coincide === true) items.push({ estado: "ok", texto: "El RUC del código coincide con el de quien emite" });
  if (v.ruc_coincide === false) items.push({ estado: "alerta", texto: "El RUC del código no coincide con el de quien emite" });
  if (v.numero_coincide === true) items.push({ estado: "ok", texto: "El número de factura coincide con el código" });
  if (v.numero_coincide === false) items.push({ estado: "alerta", texto: "El número de factura no coincide con el código" });
  if (v.vencimiento_coherente === false) items.push({ estado: "alerta", texto: "El vencimiento es anterior a la fecha de emisión" });
  items.push(
    v.duplicada
      ? { estado: "alerta", texto: "Este código ya se cargó antes en ViaFactoring" }
      : { estado: "ok", texto: "No hay otra factura cargada con este código" },
  );
  return items;
}

function BloqueIA({ inv, cargando, onReintentar }: { inv: Investigacion | null; cargando: boolean; onReintentar: () => void }) {
  if (cargando || !inv || inv.estado === "en_curso") {
    return (
      <div role="status" className="flex flex-col gap-2.5">
        <p className="text-sm text-ink-soft flex items-center gap-2">
          <span className="h-4 w-4 rounded-full border-2 border-accent/30 border-t-accent animate-spin" />
          Buscando datos públicos de las empresas…
        </p>
        <div className="h-3 rounded-full bg-surface-3 animate-pulse" />
        <div className="h-3 w-4/5 rounded-full bg-surface-3 animate-pulse" />
        <div className="h-3 w-3/5 rounded-full bg-surface-3 animate-pulse" />
      </div>
    );
  }
  if (inv.estado === "error") {
    return (
      <div className="flex flex-col gap-2 items-start">
        <p className="text-sm text-ink-soft">{inv.error ?? "No se pudo completar la búsqueda."}</p>
        <button type="button" onClick={onReintentar} className="min-h-10 px-3.5 rounded-full border border-line-strong text-sm font-semibold">
          Reintentar
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-3">
      {inv.resumen && <p className="text-sm">{inv.resumen}</p>}
      {(inv.hallazgos ?? []).length > 0 && (
        <ul className="flex flex-col gap-2">
          {inv.hallazgos!.map((h, i) => (
            <Linea key={i} estado={h.tipo === "alerta" ? "alerta" : h.tipo === "ok" ? "ok" : "info"}>
              {h.texto}
            </Linea>
          ))}
        </ul>
      )}
      {inv.contratos_estado && (
        <p className="text-sm bg-surface-2 rounded-xl px-3 py-2">
          <span className="font-semibold">Contratos con el Estado: </span>
          {inv.contratos_estado}
        </p>
      )}
      {inv.sitio_web && (
        <a href={inv.sitio_web} target="_blank" rel="noreferrer" className="text-sm font-semibold break-all">
          {inv.sitio_web.replace(/^https?:\/\//, "")}
        </a>
      )}
      {(inv.fuentes ?? []).length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer font-semibold text-ink-soft min-h-9 flex items-center">
            Fuentes ({inv.fuentes!.length})
          </summary>
          <ul className="flex flex-col gap-1 mt-1">
            {inv.fuentes!.map((f) => (
              <li key={f.url}>
                <a href={f.url} target="_blank" rel="noreferrer" className="break-all">
                  {f.titulo}
                </a>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

export function FichaVerificacion({
  revealId,
  ficha: inicial,
  puedeInvestigar,
}: {
  revealId: string;
  ficha: Ficha;
  puedeInvestigar: boolean;
}) {
  const [ficha, setFicha] = useState(inicial);
  const necesita =
    puedeInvestigar && (!inicial.investigacion || inicial.investigacion.estado === "en_curso");
  const [cargando, setCargando] = useState(necesita);
  const [copiado, setCopiado] = useState(false);

  useEffect(() => {
    if (!necesita) return;
    let vigente = true;
    investigarAction(revealId).then((r) => {
      if (!vigente) return;
      if (r.ficha) setFicha(r.ficha);
      setCargando(false);
    });
    return () => {
      vigente = false;
    };
  }, [necesita, revealId]);

  async function reintentar() {
    setCargando(true);
    const r = await reintentarInvestigacionAction(revealId);
    if (r.ficha) setFicha(r.ficha);
    setCargando(false);
  }

  async function copiar() {
    if (!ficha.cdc) return;
    try {
      await navigator.clipboard.writeText(ficha.cdc);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <section aria-label="Ficha de verificación" className="rounded-3xl bg-surface border border-line overflow-hidden">
      <div className="bg-ink text-white px-5 py-4 flex items-center gap-3">
        <span className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
            <path d="M9 12l2 2 4-4" />
          </svg>
        </span>
        <div>
          <p className="font-bold text-white leading-tight">Ficha de verificación</p>
          <p className="text-xs text-[#9fd8c0] font-semibold tracking-wide">CONTROLES AUTOMÁTICOS · IA</p>
        </div>
      </div>

      <div className="p-5 flex flex-col gap-5">
        <div className="flex flex-col gap-3">
          <p className="text-xs uppercase tracking-wide text-ink-soft font-semibold">La factura</p>
          <ul className="flex flex-col gap-2">
            {controles(ficha).map((c, i) => (
              <Linea key={i} estado={c.estado}>{c.texto}</Linea>
            ))}
            {ficha.cdc && (
              <Linea estado="pendiente">Existencia en la DNIT: verificala con el código en e-Kuatia</Linea>
            )}
          </ul>
          {ficha.cdc && (
            <div className="flex flex-col gap-2">
              <p className="num text-[13px] tracking-wide bg-surface-2 rounded-xl px-3 py-2 break-all">{formatearCdc(ficha.cdc)}</p>
              <div className="flex gap-2">
                <button type="button" onClick={copiar} className="min-h-10 px-3.5 rounded-full border border-line-strong text-sm font-semibold flex-1">
                  {copiado ? "¡Copiado!" : "Copiar código"}
                </button>
                <a href={CONSULTA_EKUATIA} target="_blank" rel="noreferrer" className="min-h-10 px-3.5 rounded-full bg-ink text-white text-sm font-semibold flex items-center justify-center flex-1">
                  Abrir e-Kuatia
                </a>
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <p className="text-xs uppercase tracking-wide text-ink-soft font-semibold">Las empresas · datos públicos</p>
          {puedeInvestigar || ficha.investigacion ? (
            <BloqueIA inv={ficha.investigacion} cargando={cargando} onReintentar={reintentar} />
          ) : (
            <p className="text-sm text-ink-soft">Se completa cuando el fondeador abre la negociación.</p>
          )}
        </div>

        <p className="text-[11.5px] text-ink-soft leading-snug border-t border-line pt-3">
          Datos recopilados automáticamente de fuentes públicas. Pueden estar incompletos o desactualizados y no son
          una recomendación: cada fondeador hace su propio análisis.
        </p>
      </div>
    </section>
  );
}

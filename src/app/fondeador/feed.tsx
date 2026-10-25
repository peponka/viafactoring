"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { marcarInteresAction, pasarFacturaAction, deshacerPasoAction, restaurarPasadasAction } from "./actions";
import { formatFecha, formatMonto } from "@/lib/format";
import { CATEGORIA_LABEL, DEUDOR_TIPO_LABEL, rangoTexto } from "@/lib/categorias";
import type { CategoriaFondeador, DeudorTipo, Riesgo } from "@/lib/database.types";

export type FacturaFeed = {
  id: string;
  industria: string;
  deudorTipo: DeudorTipo;
  monto: number;
  moneda: string;
  montoUsd: number | null;
  plazoDias: number;
  vencimiento: string | null;
  riesgo: Riesgo;
  descripcion: string | null;
  ofertas: number;
  creada: string;
  verif: {
    cdc_presente?: boolean;
    cdc_dv_ok?: boolean | null;
    ruc_coincide?: boolean | null;
    numero_coincide?: boolean | null;
    duplicada?: boolean | null;
  };
  datosSector: [string, string][];
};

function chipsVerificacion(v: FacturaFeed["verif"]) {
  const chips: { texto: string; tono: "ok" | "alerta" | "neutro" }[] = [];
  if (!v.cdc_presente) return [{ texto: "Sin código de control", tono: "neutro" as const }];
  chips.push(v.cdc_dv_ok ? { texto: "CDC válido", tono: "ok" } : { texto: "CDC inválido", tono: "alerta" });
  if (v.ruc_coincide === true) chips.push({ texto: "RUC coincide", tono: "ok" });
  if (v.ruc_coincide === false) chips.push({ texto: "RUC no coincide", tono: "alerta" });
  if (v.numero_coincide === false) chips.push({ texto: "Número no coincide", tono: "alerta" });
  chips.push(v.duplicada ? { texto: "Ya cargada antes", tono: "alerta" } : { texto: "Sin duplicados", tono: "ok" });
  return chips;
}

type Toast =
  | { tipo: "interes"; dealRoomId: string }
  | { tipo: "paso"; id: string }
  | { tipo: "error"; mensaje: string };

const RIESGO_ESTILO: Record<Riesgo, string> = {
  bajo: "bg-good-soft text-good",
  medio: "bg-warn-soft text-warn",
  alto: "bg-critical-soft text-critical",
};
const RIESGO_TEXTO: Record<Riesgo, string> = { bajo: "Bajo", medio: "Medio", alto: "Alto" };

const UMBRAL = 110;

function hace(fecha: string) {
  const min = Math.round((Date.now() - new Date(fecha).getTime()) / 60000);
  if (min < 60) return `hace ${Math.max(min, 1)} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? "ayer" : `hace ${d} días`;
}

function Icono({ d, className = "" }: { d: React.ReactNode; className?: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>
      {d}
    </svg>
  );
}

function Tarjeta({ f }: { f: FacturaFeed }) {
  return (
    <div className="flex flex-col gap-3 sm:gap-4 h-full">
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5 flex-wrap">
          <span className="text-xs font-semibold bg-slate-soft text-slate-ink px-2.5 py-1 rounded-full">{f.industria}</span>
          <span className="text-xs font-semibold bg-slate-soft text-slate-ink px-2.5 py-1 rounded-full">
            {f.deudorTipo === "estado" ? "Deudor: Estado" : DEUDOR_TIPO_LABEL[f.deudorTipo]}
          </span>
        </div>
        <span className="text-xs text-ink-soft whitespace-nowrap">{hace(f.creada)}</span>
      </div>

      <div>
        <p className="text-sm text-ink-soft">Monto de la factura</p>
        <p className="num text-[1.9rem] sm:text-[2.15rem] leading-tight font-semibold">{formatMonto(f.monto, f.moneda)}</p>
        {f.moneda !== "USD" && f.montoUsd != null && (
          <p className="text-sm text-ink-soft num">≈ {formatMonto(f.montoUsd, "USD")}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <div className="bg-surface-2 rounded-2xl px-3.5 py-3">
          <p className="text-xs text-ink-soft">Plazo</p>
          <p className="font-semibold">{f.plazoDias} días</p>
        </div>
        <div className="bg-surface-2 rounded-2xl px-3.5 py-3">
          <p className="text-xs text-ink-soft">Vence</p>
          <p className="font-semibold num">{formatFecha(f.vencimiento)}</p>
        </div>
        <div className="bg-surface-2 rounded-2xl px-3.5 py-3">
          <p className="text-xs text-ink-soft mb-1">Riesgo</p>
          <span className={`text-[13px] font-bold px-2.5 py-0.5 rounded-full ${RIESGO_ESTILO[f.riesgo]}`}>{RIESGO_TEXTO[f.riesgo]}</span>
        </div>
        <div className="bg-surface-2 rounded-2xl px-3.5 py-3">
          <p className="text-xs text-ink-soft">Ofertas</p>
          <p className="font-semibold">{f.ofertas === 0 ? "Ninguna aún" : f.ofertas === 1 ? "1 oferta" : `${f.ofertas} ofertas`}</p>
        </div>
      </div>

      {(f.descripcion || f.datosSector.length > 0) && (
        <div className="text-sm text-ink-soft flex flex-col gap-1">
          {f.descripcion && <p className="line-clamp-1 sm:line-clamp-2">{f.descripcion}</p>}
          {f.datosSector.length > 0 && (
            <p className="text-xs">{f.datosSector.map(([k, v]) => `${k}: ${v}`).join(" · ")}</p>
          )}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-xs font-semibold text-ink-soft mr-0.5">Verificación</span>
        {chipsVerificacion(f.verif).map((c) => (
          <span
            key={c.texto}
            className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-1 rounded-full ${
              c.tono === "ok" ? "bg-good-soft text-good" : c.tono === "alerta" ? "bg-critical-soft text-critical" : "bg-slate-soft text-slate-ink"
            }`}
          >
            {c.tono === "ok" && (
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M20 6 9 17l-5-5" />
              </svg>
            )}
            {c.texto}
          </span>
        ))}
      </div>

      <div className="border-[1.5px] border-dashed border-line-strong rounded-2xl p-3.5 flex gap-3 items-start">
        <span className="w-9 h-9 rounded-xl bg-accent-soft text-accent flex items-center justify-center shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="4" y="11" width="16" height="10" rx="2" />
            <path d="M8 11V7a4 4 0 0 1 8 0v4" />
          </svg>
        </span>
        <div>
          <p className="text-sm font-semibold">Deudor, investigación con IA y factura</p>
          <p className="hidden sm:block text-[13px] text-ink-soft leading-snug">Se ven al tocar «Me interesa», sin costo. El contacto directo se libera al cerrar el trato.</p>
          <p className="sm:hidden text-[13px] text-ink-soft leading-snug">Se ven al tocar «Me interesa», sin costo.</p>
        </div>
      </div>

      <p className="hidden md:block mt-auto text-[11.5px] text-ink-soft leading-snug">
        El riesgo lo declara la empresa que publica. ViaFactoring conecta partes: no evalúa ni recomienda facturas.
      </p>
    </div>
  );
}

export function Feed({
  facturas,
  pasadas,
  perfil,
}: {
  facturas: FacturaFeed[];
  pasadas: number;
  perfil: { categoria: CategoriaFondeador; min: number | null; max: number | null; plazoMax: number | null };
}) {
  const [cola, setCola] = useState(facturas);
  const [dragX, setDragX] = useState(0);
  const [salida, setSalida] = useState<"izq" | "der" | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [arrastrando, setArrastrando] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [interesadas, setInteresadas] = useState(0);
  const [pasadasSesion, setPasadasSesion] = useState(0);
  const [restaurando, setRestaurando] = useState(false);
  const pasadasTotal = pasadas + pasadasSesion;
  const inicio = useRef<number | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const total = facturas.length;
  const actual = cola[0];

  const mostrarToast = useCallback((t: Toast) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(t);
    toastTimer.current = setTimeout(() => setToast(null), 8000);
  }, []);

  useEffect(() => () => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
  }, []);

  const animarYSacar = useCallback((dir: "izq" | "der") => {
    setSalida(dir);
    setTimeout(() => {
      setCola((c) => c.slice(1));
      setSalida(null);
      setDragX(0);
    }, 230);
  }, []);

  const decidir = useCallback(
    async (dir: "izq" | "der") => {
      if (!actual || ocupado || salida) return;
      const f = actual;
      if (dir === "izq") {
        animarYSacar("izq");
        setPasadasSesion((n) => n + 1);
        mostrarToast({ tipo: "paso", id: f.id });
        const r = await pasarFacturaAction(f.id);
        if (r.error) mostrarToast({ tipo: "error", mensaje: r.error });
        return;
      }
      setOcupado(true);
      const r = await marcarInteresAction(f.id);
      setOcupado(false);
      if (r.error || !r.dealRoomId) {
        setDragX(0);
        mostrarToast({ tipo: "error", mensaje: r.error ?? "No pudimos abrir la negociación." });
        return;
      }
      setInteresadas((n) => n + 1);
      animarYSacar("der");
      mostrarToast({ tipo: "interes", dealRoomId: r.dealRoomId });
    },
    [actual, ocupado, salida, animarYSacar, mostrarToast],
  );

  async function deshacer(id: string) {
    const f = facturas.find((x) => x.id === id);
    if (!f) return;
    setToast(null);
    setPasadasSesion((n) => Math.max(0, n - 1));
    setCola((c) => [f, ...c.filter((x) => x.id !== id)]);
    await deshacerPasoAction(id);
  }

  async function restaurarPasadas() {
    setRestaurando(true);
    const r = await restaurarPasadasAction();
    if (r.error) {
      setRestaurando(false);
      mostrarToast({ tipo: "error", mensaje: r.error });
      return;
    }
    window.location.reload();
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable)) return;
      if (e.key === "ArrowLeft") decidir("izq");
      if (e.key === "ArrowRight") decidir("der");
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [decidir]);

  function onPointerDown(e: React.PointerEvent) {
    if (ocupado || salida) return;
    inicio.current = e.clientX;
    setArrastrando(true);
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent) {
    if (inicio.current == null) return;
    setDragX(e.clientX - inicio.current);
  }
  function onPointerUp() {
    if (inicio.current == null) return;
    inicio.current = null;
    setArrastrando(false);
    if (dragX > UMBRAL) decidir("der");
    else if (dragX < -UMBRAL) decidir("izq");
    else setDragX(0);
  }

  const x = salida === "der" ? 640 : salida === "izq" ? -640 : dragX;
  const intensidad = Math.min(Math.abs(dragX) / UMBRAL, 1);
  const posicion = total - cola.length + 1;

  return (
    <div className="grid md:grid-cols-[minmax(0,440px)_minmax(0,1fr)] gap-8 items-start">
      <section aria-label="Facturas en tu rango" className="flex flex-col gap-5 pb-28 md:pb-0">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-[1.6rem] font-bold leading-tight">Facturas para vos</h1>
            <p className="text-sm text-ink-soft">
              {cola.length === 0 ? "Viste todo por ahora" : `${posicion} de ${total} en tu rango`}
              {pasadasTotal > 0 && (
                <>
                  {" · "}
                  <button
                    type="button"
                    onClick={restaurarPasadas}
                    disabled={restaurando}
                    className="font-semibold text-accent hover:underline disabled:opacity-60"
                  >
                    {restaurando ? "Recuperando…" : `Ver ${pasadasTotal === 1 ? "la que pasaste" : `las ${pasadasTotal} que pasaste`}`}
                  </button>
                </>
              )}
            </p>
          </div>
          <Link
            href="/fondeador/preferencias"
            className="md:hidden inline-flex items-center gap-1.5 min-h-11 px-3.5 rounded-full border border-line bg-surface text-sm font-semibold"
          >
            <Icono d={<path d="M3 6h18M7 12h10M10 18h4" />} className="w-4 h-4 text-accent" />
            Filtros
          </Link>
        </div>

        {actual ? (
          <>
            <div className="relative min-h-[420px] md:min-h-[520px] select-none">
              <div aria-hidden="true" className="absolute inset-x-5 top-4 -bottom-3.5 rounded-[28px] bg-surface-3" />
              <div aria-hidden="true" className="absolute inset-x-2.5 top-2 -bottom-1.5 rounded-[28px] bg-[#f0eee7] border border-line" />
              <article
                key={actual.id}
                aria-roledescription="tarjeta deslizable"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
                className="anim-in relative h-full min-h-[420px] md:min-h-[520px] bg-surface border border-line rounded-[28px] shadow-[var(--shadow-lift)] p-5 sm:p-6 touch-pan-y cursor-grab active:cursor-grabbing"
                style={{
                  transform: `translateX(${x}px) rotate(${x / 22}deg)`,
                  transition: arrastrando ? "none" : "transform .23s cubic-bezier(.2,.8,.2,1)",
                }}
              >
                <span
                  aria-hidden="true"
                  className="absolute top-6 right-6 z-10 rotate-12 border-[3px] border-accent text-accent font-display font-bold text-lg px-3 py-1 rounded-xl bg-surface/80"
                  style={{ opacity: dragX > 0 ? intensidad : 0 }}
                >
                  ME INTERESA
                </span>
                <span
                  aria-hidden="true"
                  className="absolute top-6 left-6 z-10 -rotate-12 border-[3px] border-ink-soft text-ink-soft font-display font-bold text-lg px-3 py-1 rounded-xl bg-surface/80"
                  style={{ opacity: dragX < 0 ? intensidad : 0 }}
                >
                  PASO
                </span>
                <Tarjeta f={actual} />
              </article>
            </div>
            <p className="md:hidden text-[11.5px] text-ink-soft leading-snug px-1">
              El riesgo lo declara la empresa que publica. ViaFactoring conecta partes: no evalúa ni recomienda facturas.
            </p>

            <div className="fixed md:sticky inset-x-0 bottom-[74px] md:bottom-0 z-30 pt-8 pb-3 md:pt-10 md:pb-5 md:-mt-8 bg-gradient-to-t from-background via-background/95 to-transparent flex items-center justify-center gap-8 pointer-events-none [&>*]:pointer-events-auto">
              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => decidir("izq")}
                  disabled={ocupado}
                  aria-label="Pasar esta factura"
                  className="w-16 h-16 rounded-full border border-line bg-surface text-ink-soft flex items-center justify-center shadow-[var(--shadow-card)] transition hover:border-ink-soft active:scale-95 disabled:opacity-50"
                >
                  <Icono d={<path d="M6 6l12 12M18 6 6 18" />} />
                </button>
                <span className="text-xs font-semibold text-ink-soft">Paso</span>
              </div>
              <div className="flex flex-col items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => decidir("der")}
                  disabled={ocupado}
                  aria-label="Me interesa esta factura"
                  className="w-[76px] h-[76px] rounded-full bg-accent text-white flex items-center justify-center shadow-[0_10px_24px_rgb(11_110_79_/_0.35)] transition hover:bg-accent-strong active:scale-95 disabled:opacity-70"
                >
                  {ocupado ? (
                    <span className="w-6 h-6 rounded-full border-[3px] border-white/40 border-t-white animate-spin" />
                  ) : (
                    <Icono d={<path d="M20 6 9 17l-5-5" />} className="w-7 h-7" />
                  )}
                </button>
                <span className="text-xs font-bold text-accent">Me interesa</span>
              </div>
            </div>
          </>
        ) : (
          <div className="bg-surface border border-line rounded-[28px] min-h-[420px] px-6 py-12 flex flex-col items-center justify-center gap-3 text-center">
            <span className="w-16 h-16 rounded-2xl bg-accent-soft text-accent flex items-center justify-center">
              <Icono d={<path d="M20 6 9 17l-5-5" />} className="w-7 h-7" />
            </span>
            <h2 className="text-2xl font-bold">
              {total === 0 ? "Todavía no hay facturas en tu rango" : "Viste todo por ahora"}
            </h2>
            <p className="text-ink-soft max-w-[40ch]">
              Te avisamos apenas entre una factura que encaje con tus preferencias.

            </p>
            <div className="flex gap-2.5 flex-wrap justify-center mt-2">
              {pasadasTotal > 0 && (
                <button
                  type="button"
                  onClick={restaurarPasadas}
                  disabled={restaurando}
                  className="min-h-11 px-5 rounded-full bg-ink text-white font-semibold disabled:opacity-60"
                >
                  {restaurando ? "Recuperando…" : `Volver a ver ${pasadasTotal === 1 ? "la que pasaste" : `las ${pasadasTotal} que pasaste`}`}
                </button>
              )}
              <Link href="/fondeador/preferencias" className="min-h-11 px-5 rounded-full border border-line-strong bg-surface font-semibold flex items-center">
                Ampliar mi rango
              </Link>
              {interesadas > 0 && (
                <Link href="/fondeador/deal-rooms" className="min-h-11 px-5 rounded-full bg-accent text-white font-semibold flex items-center">
                  Ver mis negociaciones
                </Link>
              )}
            </div>
          </div>
        )}
      </section>

      <aside className="hidden md:flex flex-col gap-4 sticky top-24">
        <div className="bg-surface border border-line rounded-3xl p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="font-bold">Tu búsqueda</p>
            <Link href="/fondeador/preferencias" className="text-sm font-semibold">Editar</Link>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="bg-surface-2 rounded-2xl px-3.5 py-3">
              <p className="text-xs text-ink-soft">Montos</p>
              <p className="font-semibold text-sm">{rangoTexto(perfil.min, perfil.max)}</p>
            </div>
            <div className="bg-surface-2 rounded-2xl px-3.5 py-3">
              <p className="text-xs text-ink-soft">Plazo</p>
              <p className="font-semibold text-sm">{perfil.plazoMax ? `Hasta ${perfil.plazoMax} días` : "Sin límite"}</p>
            </div>
          </div>
          <p className="text-xs text-ink-soft flex items-center gap-1.5">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-accent">
              <path d="M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            Cuenta verificada · {CATEGORIA_LABEL[perfil.categoria]}
          </p>
        </div>

        {cola.length > 1 && (
          <div className="bg-surface border border-line rounded-3xl p-5 flex flex-col gap-2">
            <p className="font-bold mb-1">Próximas</p>
            {cola.slice(1, 5).map((f) => (
              <div key={f.id} className="flex items-center justify-between gap-3 rounded-2xl bg-surface-2 px-3.5 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{f.industria}</p>
                  <p className="text-xs text-ink-soft">{f.plazoDias} días · riesgo {RIESGO_TEXTO[f.riesgo].toLowerCase()}</p>
                </div>
                <p className="num font-semibold text-sm whitespace-nowrap">{formatMonto(f.monto, f.moneda)}</p>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-3xl bg-ink text-white p-5 flex flex-col gap-2">
          <p className="font-bold text-white">Atajos</p>
          <p className="text-sm text-[#c9d2dd] flex items-center gap-2">
            <kbd className="px-2 py-0.5 rounded-md bg-white/10 font-sans text-xs">←</kbd> Paso
            <kbd className="ml-3 px-2 py-0.5 rounded-md bg-white/10 font-sans text-xs">→</kbd> Me interesa
          </p>
          <p className="text-sm text-[#c9d2dd]">También podés arrastrar la tarjeta.</p>
        </div>
      </aside>

      {toast && (
        <div
          role="status"
          className="anim-in fixed z-50 left-4 right-4 top-20 md:top-auto md:bottom-8 md:left-auto md:right-8 md:w-[380px] bg-ink text-white rounded-2xl p-4 shadow-[0_16px_40px_rgb(16_24_40_/_0.3)] flex items-center gap-3"
        >
          {toast.tipo === "interes" && (
            <>
              <span className="w-9 h-9 rounded-xl bg-accent flex items-center justify-center shrink-0">
                <Icono d={<path d="M20 6 9 17l-5-5" />} className="w-4 h-4" />
              </span>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">Se abrió la negociación</p>
                <p className="text-[13px] text-[#c9d2dd]">Ya podés ver el deudor y hacer tu oferta.</p>
              </div>
              <Link href={`/deal-room/${toast.dealRoomId}`} className="shrink-0 min-h-10 px-3.5 rounded-full bg-white text-ink text-sm font-bold flex items-center">
                Abrir
              </Link>
            </>
          )}
          {toast.tipo === "paso" && (
            <>
              <p className="flex-1 text-sm">Factura pasada. No la vas a volver a ver.</p>
              <button type="button" onClick={() => deshacer(toast.id)} className="shrink-0 min-h-10 px-3.5 rounded-full border border-white/30 text-sm font-semibold">
                Deshacer
              </button>
            </>
          )}
          {toast.tipo === "error" && <p className="flex-1 text-sm">{toast.mensaje}</p>}
        </div>
      )}
    </div>
  );
}

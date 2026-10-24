"use client";

import { useEffect, useState } from "react";

type EventoInstalar = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const CLAVE = "vf-instalar-oculto";

/** Registra el service worker (solo en producción). */
export function RegistrarSW() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
  }, []);
  return null;
}

/**
 * Aviso para instalar la app en el celular. En Android usa el diálogo del
 * navegador; en iPhone explica cómo agregarla a la pantalla de inicio.
 */
export function InstalarApp() {
  const [evento, setEvento] = useState<EventoInstalar | null>(null);
  const [esIos, setEsIos] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let oculto = false;
    try {
      oculto = localStorage.getItem(CLAVE) === "1";
    } catch {
      oculto = false;
    }
    const instalada =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (oculto || instalada) return;

    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const t = setTimeout(() => {
      if (ios) {
        setEsIos(true);
        setVisible(true);
      }
    }, 2500);

    function onPrompt(e: Event) {
      e.preventDefault();
      setEvento(e as EventoInstalar);
      setVisible(true);
    }
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => {
      clearTimeout(t);
      window.removeEventListener("beforeinstallprompt", onPrompt);
    };
  }, []);

  function cerrar() {
    setVisible(false);
    try {
      localStorage.setItem(CLAVE, "1");
    } catch {
      // sin almacenamiento: se vuelve a mostrar la próxima vez
    }
  }

  async function instalar() {
    if (!evento) return;
    await evento.prompt();
    await evento.userChoice.catch(() => null);
    setEvento(null);
    cerrar();
  }

  if (!visible || (!evento && !esIos)) return null;

  return (
    <div
      role="dialog"
      aria-label="Instalar ViaFactoring"
      className="anim-in md:hidden fixed z-50 left-3 right-3 bottom-[88px] bg-surface border border-line rounded-3xl shadow-[var(--shadow-lift)] p-4 flex gap-3 items-start"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/icon-192.png" alt="" width={44} height={44} className="rounded-xl shrink-0" />
      <div className="flex-1 min-w-0">
        <p className="font-bold">Tené ViaFactoring como app</p>
        {esIos ? (
          <p className="text-sm text-ink-soft mt-0.5">
            Tocá <span className="font-semibold text-ink">Compartir</span> y después{" "}
            <span className="font-semibold text-ink">Agregar a inicio</span>.
          </p>
        ) : (
          <p className="text-sm text-ink-soft mt-0.5">Abrila desde tu pantalla de inicio y recibí los avisos al instante.</p>
        )}
        {!esIos && (
          <button type="button" onClick={instalar} className="mt-2.5 min-h-10 px-4 rounded-full bg-accent text-white text-sm font-bold">
            Instalar
          </button>
        )}
      </div>
      <button type="button" onClick={cerrar} aria-label="Cerrar" className="w-10 h-10 -mr-1 -mt-1 rounded-full flex items-center justify-center text-ink-soft hover:bg-surface-2">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6 6 18" />
        </svg>
      </button>
    </div>
  );
}

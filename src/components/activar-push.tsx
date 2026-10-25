"use client";

import { useEffect, useState } from "react";
import { guardarSuscripcionPushAction, quitarSuscripcionPushAction } from "@/app/push/actions";

// Botón para recibir avisos al instante (ofertas, mensajes, pagos) en este
// dispositivo. En iPhone solo funciona con la app instalada en la pantalla
// de inicio.

type Estado = "cargando" | "no-soportado" | "ios-instalar" | "bloqueado" | "activo" | "inactivo";

function claveBase64(base64: string) {
  const relleno = "=".repeat((4 - (base64.length % 4)) % 4);
  const b = atob((base64 + relleno).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
}

const CLAVE_OCULTO = "vf-push-oculto";

export function ActivarPush({ variante = "tarjeta" }: { variante?: "tarjeta" | "fila" }) {
  const [estado, setEstado] = useState<Estado>("cargando");
  const [ocupado, setOcupado] = useState(false);
  const [oculto, setOculto] = useState(false);
  const publica = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;

  useEffect(() => {
    (async () => {
      try {
        setOculto(localStorage.getItem(CLAVE_OCULTO) === "1");
      } catch {
        setOculto(false);
      }
      const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
      const instalada =
        window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone === true;
      if (!publica || !("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
        setEstado(ios && !instalada ? "ios-instalar" : "no-soportado");
        return;
      }
      if (Notification.permission === "denied") {
        setEstado("bloqueado");
        return;
      }
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      setEstado(sub ? "activo" : "inactivo");
    })().catch(() => setEstado("no-soportado"));
  }, [publica]);

  async function activar() {
    if (!publica) return;
    setOcupado(true);
    try {
      const permiso = await Notification.requestPermission();
      if (permiso !== "granted") {
        setEstado(permiso === "denied" ? "bloqueado" : "inactivo");
        return;
      }
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js"));
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: claveBase64(publica) }));
      const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
      const r = await guardarSuscripcionPushAction(json, navigator.userAgent);
      setEstado(r.error ? "inactivo" : "activo");
    } catch {
      setEstado("inactivo");
    } finally {
      setOcupado(false);
    }
  }

  async function desactivar() {
    setOcupado(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await quitarSuscripcionPushAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setEstado("inactivo");
    } finally {
      setOcupado(false);
    }
  }

  function ocultar() {
    setOculto(true);
    try {
      localStorage.setItem(CLAVE_OCULTO, "1");
    } catch {
      // sin almacenamiento: se oculta solo por esta visita
    }
  }

  if (variante === "fila") {
    return (
      <div className="flex items-center justify-between gap-3 flex-wrap text-sm">
        <span>
          Avisos en este dispositivo:{" "}
          <strong>
            {estado === "activo"
              ? "activados"
              : estado === "bloqueado"
                ? "bloqueados en el navegador"
                : estado === "ios-instalar"
                  ? "instalá la app para activarlos"
                  : estado === "no-soportado"
                    ? "no disponibles en este navegador"
                    : "desactivados"}
          </strong>
        </span>
        {estado === "activo" && (
          <button type="button" onClick={desactivar} disabled={ocupado} className="underline text-ink-soft">
            Desactivar
          </button>
        )}
        {estado === "inactivo" && (
          <button
            type="button"
            onClick={activar}
            disabled={ocupado}
            className="min-h-10 px-4 rounded-full bg-accent text-white font-semibold disabled:opacity-60"
          >
            {ocupado ? "Activando…" : "Activar avisos"}
          </button>
        )}
      </div>
    );
  }

  if (oculto || estado !== "inactivo") return null;
  return (
    <div className="rounded-2xl border border-accent/30 bg-accent-soft px-4 py-3 flex items-center gap-3 flex-wrap">
      <span aria-hidden="true" className="text-lg">🔔</span>
      <p className="text-sm flex-1 min-w-[16ch]">
        <strong>Enterate al instante</strong> de ofertas y mensajes, aunque tengas la app cerrada.
      </p>
      <div className="flex gap-2">
        <button
          type="button"
          onClick={activar}
          disabled={ocupado}
          className="min-h-10 px-4 rounded-full bg-accent text-white text-sm font-semibold disabled:opacity-60"
        >
          {ocupado ? "Activando…" : "Activar avisos"}
        </button>
        <button type="button" onClick={ocultar} className="min-h-10 px-2 text-sm text-ink-soft">
          Ahora no
        </button>
      </div>
    </div>
  );
}

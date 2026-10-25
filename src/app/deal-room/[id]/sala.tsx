"use client";

import { MontoInput } from "@/components/monto-input";
import { comisionCierreUsd } from "@/lib/categorias";
import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { detectarContacto } from "@/lib/contacto";
import { descuentoImplicito, formatFecha, formatFechaHora, formatMonto, formatPct } from "@/lib/format";
import { Badge, Button, ErrorText, Field, Input, Textarea } from "@/components/ui";
import type { Franja } from "@/lib/turno";
import type { DealRoomDetail, DealRoomOferta, DocumentRow, Message } from "@/lib/database.types";
import {
  declararTransferenciaAction,
  enviarMensajeAction,
  marcarLeidosAction,
  ofertarAction,
  pagarComisionAction,
  responderOfertaAction,
  solicitarDevolucionAction,
  subirDocumentoAction,
  type Resultado,
} from "../actions";

// La sala: la conversación es el centro. Ofertas, pago de la comisión,
// contacto y desembolso aparecen como tarjetas del hilo; la única acción
// pendiente vive en la franja de turno, justo arriba de donde se escribe.

type Rol = DealRoomDetail["rol"];

function nombreRol(rol: string, mio: boolean) {
  if (mio) return "Vos";
  return rol === "fondeador" ? "Fondeador" : "PyME";
}

const ESTADO_OFERTA: Record<string, { label: string; tone: "good" | "warn" | "neutral" | "critical" }> = {
  pendiente: { label: "Esperando respuesta", tone: "warn" },
  aceptada: { label: "Aceptada", tone: "good" },
  rechazada: { label: "Rechazada", tone: "critical" },
  reemplazada: { label: "Reemplazada por una contraoferta", tone: "neutral" },
  cancelada: { label: "Sin efecto", tone: "neutral" },
  expirada: { label: "Vencida", tone: "neutral" },
};

function siNo(v: boolean | null) {
  return v === true ? "Sí" : v === false ? "No" : "A definir";
}

// ---------------------------------------------------------------- tarjetas

function TarjetaOferta({ o, d }: { o: DealRoomOferta; d: DealRoomDetail }) {
  const mia = o.autor_rol === d.rol;
  const calc = descuentoImplicito(d.invoice.monto, o.monto_ofrecido, d.invoice.fecha_vencimiento, d.invoice.plazo_dias);
  const est = ESTADO_OFERTA[o.estado] ?? ESTADO_OFERTA.pendiente;
  const padre = o.parent_offer_id ? d.ofertas.find((x) => x.id === o.parent_offer_id) : null;
  const esContra = !!padre && padre.autor_rol !== o.autor_rol;
  return (
    <div className={`flex ${mia ? "justify-end" : "justify-start"}`}>
      <div className="w-full max-w-[420px] rounded-2xl border-2 border-accent/30 bg-surface p-4 shadow-sm">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-xs font-semibold text-ink-soft">
            {esContra ? "🔄 Contraoferta" : "💰 Oferta"} · {nombreRol(o.autor_rol, mia)}
          </span>
          <Badge tone={est.tone}>{est.label}</Badge>
        </div>
        <p className="num text-2xl font-semibold mt-1">{formatMonto(o.monto_ofrecido, d.invoice.moneda)}</p>
        <p className="text-xs text-ink-soft">
          de una factura de {formatMonto(d.invoice.monto, d.invoice.moneda)}
          {calc ? ` · descuento ${formatPct(calc.descuento)}` : ""}
        </p>
        <div className="text-xs text-ink-soft grid grid-cols-2 gap-x-3 gap-y-0.5 mt-2">
          <span>Con recurso: {siNo(o.con_recurso)}</span>
          <span>Se avisa al deudor: {siNo(o.notifica_deudor)}</span>
          <span className="col-span-2">
            Pago del anticipo: {o.fecha_pago_prevista ? formatFecha(o.fecha_pago_prevista) : "a definir"}
          </span>
        </div>
        {o.mensaje && <p className="text-sm mt-2">“{o.mensaje}”</p>}
        {o.estado === "pendiente" && o.expira_at && (
          <p className="text-xs text-ink-soft mt-2">Vence el {formatFechaHora(o.expira_at)}</p>
        )}
      </div>
    </div>
  );
}

function TarjetaSistema({
  icono,
  titulo,
  texto,
  tono = "neutral",
  children,
}: {
  icono: string;
  titulo: string;
  texto?: string | null;
  tono?: "neutral" | "good" | "accent";
  children?: React.ReactNode;
}) {
  const tonos = {
    neutral: "border-line bg-surface",
    good: "border-good/40 bg-good-soft",
    accent: "border-accent/40 bg-accent-soft",
  };
  return (
    <div className="flex justify-center">
      <div className={`w-full max-w-[460px] rounded-2xl border p-4 ${tonos[tono]}`}>
        <p className="font-semibold text-sm">
          {icono} {titulo}
        </p>
        {texto && <p className="text-sm mt-1 text-ink-soft">{texto}</p>}
        {children}
      </div>
    </div>
  );
}

function Pildora({ texto, fecha }: { texto: string; fecha: string }) {
  return (
    <p className="text-center text-xs text-ink-soft bg-surface-2 rounded-full px-4 py-1.5 mx-auto max-w-[90%]">
      {texto} <span className="num opacity-70">· {formatFechaHora(fecha)}</span>
    </p>
  );
}

// ---------------------------------------------------------------- devolución

function BloqueDevolucion({ revealId, bloqueo }: { revealId: string; bloqueo: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (bloqueo === "La PyME ya respondió") return null;
  if (bloqueo === "Ya pediste la devolución") {
    return (
      <p className="text-xs text-ink-soft mt-3 border-t border-line pt-3">
        ↩️ Pediste la devolución de la comisión. ViaFactoring la está revisando.
      </p>
    );
  }
  if (bloqueo) {
    return (
      <p className="text-xs text-ink-soft mt-3 border-t border-line pt-3">
        Si la PyME no responde en 48 horas, podés pedir la devolución de la comisión.
      </p>
    );
  }
  return (
    <div className="mt-3 border-t border-line pt-3 flex flex-col gap-2">
      <p className="text-sm">¿La PyME no respondió en 48 horas? Podés pedir la devolución de la comisión.</p>
      <ErrorText>{error}</ErrorText>
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const r = await solicitarDevolucionAction(revealId);
            if (r.error) setError(r.error);
            else router.refresh();
          })
        }
        className="w-fit min-h-10 px-3.5 rounded-full border border-line-strong text-sm font-semibold disabled:opacity-60"
      >
        {pending ? "Enviando…" : "Pedir devolución"}
      </button>
    </div>
  );
}

// ---------------------------------------------------------------- oferta

function hoyIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Asuncion" }).format(new Date());
}

// Condición de la oferta, obligatoria y explicada en palabras simples.
function Condicion({
  name,
  titulo,
  defecto,
  si,
  no,
}: {
  name: string;
  titulo: string;
  defecto: string;
  si: string;
  no: string;
}) {
  return (
    <fieldset className="flex flex-col gap-1.5">
      <legend className="text-sm font-medium mb-1.5">{titulo}</legend>
      <div className="grid sm:grid-cols-2 gap-2">
        {(
          [
            ["si", "Sí", si],
            ["no", "No", no],
          ] as const
        ).map(([valor, etiqueta, texto]) => (
          <label
            key={valor}
            className="flex items-start gap-2.5 rounded-2xl border border-line px-3.5 py-3 cursor-pointer text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
          >
            <input
              type="radio"
              name={name}
              value={valor}
              required
              defaultChecked={defecto === valor}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <span>
              <span className="font-semibold">{etiqueta}.</span> <span className="text-ink-soft">{texto}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

function FormOferta({
  d,
  contraofertaDe,
  onCerrar,
  usdPorUnidad,
}: {
  d: DealRoomDetail;
  contraofertaDe: DealRoomOferta | null;
  onCerrar: () => void;
  usdPorUnidad: number | null;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<Resultado, FormData>(ofertarAction, { error: null });
  const [monto, setMonto] = useState(contraofertaDe ? String(contraofertaDe.monto_ofrecido) : "");
  const calc = descuentoImplicito(d.invoice.monto, Number(monto) || 0, d.invoice.fecha_vencimiento, d.invoice.plazo_dias);
  const def = (v: boolean | null | undefined) => (v === true ? "si" : v === false ? "no" : "");

  useEffect(() => {
    if (state.ok) {
      onCerrar();
      router.refresh();
    }
  }, [state.ok, onCerrar, router]);

  return (
    <form action={action} className="rounded-2xl border border-line bg-surface p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <p className="font-semibold text-sm">{contraofertaDe ? "Tu contraoferta" : "Tu oferta"}</p>
        <button type="button" onClick={onCerrar} className="text-xs text-ink-soft hover:text-ink">
          Cancelar
        </button>
      </div>
      <input type="hidden" name="reveal_id" value={d.reveal_id} />
      <input type="hidden" name="invoice_id" value={d.invoice.id} />
      {contraofertaDe && <input type="hidden" name="offer_id" value={contraofertaDe.id} />}
      <Field label={`Anticipo en ${d.invoice.moneda}`}>
        <MontoInput
          name="monto_ofrecido"
          decimales={d.invoice.moneda === "USD" ? 2 : 0}
          required
          autoFocus
          value={monto}
          onChange={setMonto}
          placeholder={d.invoice.moneda === "PYG" ? "28.500.000" : "9.500"}
        />
      </Field>
      {calc && Number(monto) > 0 && (
        <p className="text-xs text-ink-soft -mt-2">
          Descuento {formatPct(calc.descuento)}
          {calc.anual != null ? ` · ~${formatPct(calc.anual)} anual a ${calc.dias} días` : ""}
        </p>
      )}
      {d.rol === "fondeador" && usdPorUnidad != null && Number(monto) > 0 && (
        <div className="rounded-2xl bg-surface-2 px-3.5 py-3 text-sm flex items-start gap-2.5">
          <span aria-hidden="true">💳</span>
          <p>
            Si la PyME acepta, pagás{" "}
            <span className="font-semibold num">
              {formatMonto(comisionCierreUsd(Number(monto) * usdPorUnidad), "USD")}
            </span>{" "}
            de comisión a ViaFactoring y recién ahí se comparten la factura y el contacto. Si no acepta, no
            pagás nada.
          </p>
        </div>
      )}
      <Condicion
        name="con_recurso"
        titulo="¿Con recurso?"
        defecto={def(contraofertaDe?.con_recurso)}
        si="Si el deudor no paga, la PyME le devuelve el anticipo al fondeador."
        no="Si el deudor no paga, el riesgo es del fondeador."
      />
      <Condicion
        name="notifica_deudor"
        titulo="¿Se le avisa al deudor?"
        defecto={def(contraofertaDe?.notifica_deudor)}
        si="El deudor sabe de la cesión y al vencimiento le paga directo al fondeador."
        no="El deudor no se entera: le paga a la PyME y ella le transfiere al fondeador."
      />
      <Field label="¿Cuándo se paga el anticipo?">
        <Input
          type="date"
          name="fecha_pago_prevista"
          required
          min={hoyIso()}
          max={d.invoice.fecha_vencimiento ?? undefined}
          defaultValue={contraofertaDe?.fecha_pago_prevista ?? ""}
        />
      </Field>
      <Field label="Mensaje (opcional)">
        <Textarea name="mensaje" rows={2} maxLength={1000} />
      </Field>
      <ErrorText>{state.error}</ErrorText>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending ? "Enviando…" : contraofertaDe ? "Enviar contraoferta" : "Enviar oferta"}
      </Button>
    </form>
  );
}

// ---------------------------------------------------------------- franja

function FranjaTurno({
  d,
  franja,
  onContraofertar,
}: {
  d: DealRoomDetail;
  franja: Franja;
  onContraofertar: (o: DealRoomOferta) => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState<null | "aceptar" | "rechazar" | "declarar">(null);
  const a = franja.accion;

  // Esperando la confirmación de la pasarela: la página se actualiza sola.
  useEffect(() => {
    if (!franja.refrescar) return;
    const t = setInterval(() => router.refresh(), 5000);
    return () => clearInterval(t);
  }, [franja.refrescar, router]);

  function correr(fn: () => Promise<{ error: string | null }>) {
    setError(null);
    startTransition(async () => {
      const r = await fn();
      setConfirmar(null);
      if (r.error) setError(r.error);
      else router.refresh();
    });
  }

  function pagar() {
    setError(null);
    startTransition(async () => {
      const r = await pagarComisionAction(d.reveal_id);
      if (!r.ok) return setError(r.error);
      if ("url" in r && r.url) window.location.href = r.url;
      else router.refresh();
    });
  }

  const tonos = {
    accion: "bg-accent-soft border-accent/40",
    espera: "bg-surface-2 border-line",
    info: "bg-surface-2 border-line",
  };

  return (
    <div className={`rounded-xl border px-4 py-3 ${tonos[franja.tono]}`} role="status">
      <p className="font-semibold text-sm">
        {franja.tono === "espera" && "⏳ "}
        {franja.titulo}
      </p>
      {franja.texto && <p className="text-sm text-ink-soft mt-0.5">{franja.texto}</p>}

      {a?.tipo === "responder_oferta" && (
        <div className="mt-3">
          {confirmar === "aceptar" ? (
            <div className="text-sm">
              <p className="font-medium">¿Aceptar {formatMonto(a.monto, d.invoice.moneda)}?</p>
              <p className="text-ink-soft mt-0.5">
                No se puede deshacer. Las demás negociaciones por esta factura se cierran.
              </p>
              <div className="flex gap-2 mt-2">
                <Button onClick={() => correr(() => responderOfertaAction(d.reveal_id, a.offerId, true))} disabled={pending} className="!py-2 !px-4 text-sm">
                  Sí, aceptar
                </Button>
                <Button variant="ghost" onClick={() => setConfirmar(null)} disabled={pending} className="!py-2 !px-4 text-sm">
                  Volver
                </Button>
              </div>
            </div>
          ) : confirmar === "rechazar" ? (
            <div className="text-sm">
              <p className="font-medium">¿Rechazar la oferta?</p>
              <div className="flex gap-2 mt-2">
                <Button variant="danger" onClick={() => correr(() => responderOfertaAction(d.reveal_id, a.offerId, false))} disabled={pending} className="!py-2 !px-4 text-sm">
                  Sí, rechazar
                </Button>
                <Button variant="ghost" onClick={() => setConfirmar(null)} disabled={pending} className="!py-2 !px-4 text-sm">
                  Volver
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 flex-wrap">
              <Button onClick={() => setConfirmar("aceptar")} disabled={pending} className="!py-2 !px-4 text-sm">
                Aceptar
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  const o = d.ofertas.find((x) => x.id === a.offerId);
                  if (o) onContraofertar(o);
                }}
                disabled={pending}
                className="!py-2 !px-4 text-sm"
              >
                Contraofertar
              </Button>
              <Button variant="ghost" onClick={() => setConfirmar("rechazar")} disabled={pending} className="!py-2 !px-4 text-sm">
                Rechazar
              </Button>
            </div>
          )}
        </div>
      )}

      {a?.tipo === "pagar_comision" && (
        <div className="mt-3">
          <Button onClick={pagar} disabled={pending} className="!py-2 !px-4 text-sm">
            {pending ? "Abriendo el pago…" : a.reintento ? "Intentar de nuevo" : "Pagar comisión"}
          </Button>
        </div>
      )}

      {a?.tipo === "declarar" && (
        <div className="mt-3">
          {confirmar === "declarar" ? (
            <div className="text-sm">
              <p className="font-medium">
                {a.lado === "envio" ? "¿Confirmás que enviaste los fondos?" : "¿Confirmás que recibiste los fondos?"}
              </p>
              <div className="flex gap-2 mt-2">
                <Button onClick={() => correr(() => declararTransferenciaAction(d.reveal_id, a.offerId))} disabled={pending} className="!py-2 !px-4 text-sm">
                  Sí, confirmar
                </Button>
                <Button variant="ghost" onClick={() => setConfirmar(null)} disabled={pending} className="!py-2 !px-4 text-sm">
                  Volver
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => setConfirmar("declarar")} disabled={pending} className="!py-2 !px-4 text-sm">
              {a.lado === "envio" ? "Ya envié los fondos" : "Ya recibí los fondos"}
            </Button>
          )}
        </div>
      )}

      {error && <div className="mt-2"><ErrorText>{error}</ErrorText></div>}
    </div>
  );
}

// ---------------------------------------------------------------- sala

export function Sala({
  d,
  mensajes,
  documentos,
  franja,
  usdPorUnidad,
  devolucion,
}: {
  d: DealRoomDetail;
  mensajes: Message[];
  documentos: DocumentRow[];
  franja: Franja | null;
  usdPorUnidad: number | null;
  /** null: el fondeador puede pedir la devolución; texto: por qué todavía no; undefined: no aplica */
  devolucion?: string | null;
}) {
  const router = useRouter();
  const rol: Rol = d.rol;
  const soloLectura = rol === "admin" || d.estado === "cancelled" || d.estado === "closed";
  const [texto, setTexto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [formOferta, setFormOferta] = useState<{ contra: DealRoomOferta | null } | null>(null);
  const hiloRef = useRef<HTMLDivElement>(null);
  const archivoRef = useRef<HTMLFormElement>(null);
  const [subida, subir, subiendo] = useActionState<Resultado, FormData>(subirDocumentoAction, { error: null });

  const avisoContacto = useMemo(() => detectarContacto(texto), [texto]);
  const docsPorId = useMemo(() => new Map(documentos.map((x) => [x.id, x])), [documentos]);
  const ofertasPorId = useMemo(() => new Map(d.ofertas.map((o) => [o.id, o])), [d.ofertas]);
  const ofertaAceptada = d.ofertas.find((o) => o.estado === "aceptada") ?? null;

  const negociable = d.estado === "open" || d.estado === "negotiating";
  const puedeOfertar =
    rol === "fondeador" && negociable && (d.turno.accion === "conversar" || d.turno.accion === "negociar");

  // Tiempo real: cualquier mensaje nuevo (incluidos los eventos del
  // sistema) actualiza la sala. La RLS filtra qué llega.
  useEffect(() => {
    const supabase = createClient();
    const canal = supabase
      .channel(`deal-room-${d.reveal_id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `reveal_id=eq.${d.reveal_id}` },
        () => router.refresh(),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "messages", filter: `reveal_id=eq.${d.reveal_id}` },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [d.reveal_id, router]);

  // Al entrar desde una notificación (#m-<id>) va a ese momento una sola vez
  // y resalta el mensaje unos segundos; después, cada novedad baja al final.
  useEffect(() => {
    const hash = typeof window !== "undefined" ? window.location.hash : "";
    const destino = hash.startsWith("#m-") ? document.getElementById(hash.slice(1)) : null;
    if (destino) {
      destino.scrollIntoView({ block: "center" });
      destino.classList.add("ring-2", "ring-accent", "rounded-2xl");
      setTimeout(() => destino.classList.remove("ring-2", "ring-accent", "rounded-2xl"), 3000);
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    } else if (hiloRef.current) {
      hiloRef.current.scrollTop = hiloRef.current.scrollHeight;
    }
    if (rol !== "admin") void marcarLeidosAction(d.reveal_id);
  }, [mensajes.length, d.reveal_id, rol]);

  useEffect(() => {
    if (subida.ok) {
      archivoRef.current?.reset();
      router.refresh();
    }
  }, [subida, router]);

  function enviar() {
    const cuerpo = texto.trim();
    if (!cuerpo) return;
    setError(null);
    startTransition(async () => {
      const r = await enviarMensajeAction(d.reveal_id, cuerpo, "mensaje");
      if (r.error) setError(r.error);
      else {
        setTexto("");
        router.refresh();
      }
    });
  }

  function renderMensaje(m: Message) {
    const kind = m.meta?.kind;
    if (m.autor_rol === "sistema") {
      if (kind === "oferta" && m.meta.offer_id) {
        const o = ofertasPorId.get(m.meta.offer_id);
        if (o) return <TarjetaOferta o={o} d={d} />;
      }
      if (kind === "comision") {
        // La tarjeta queda en su lugar del hilo como "lo que faltaba"; su
        // estado actual (pagada) se marca con una etiqueta, así el orden de
        // los eventos (pago fallido → reintento → contacto) se lee bien.
        const pagada = d.comision?.estado === "confirmado" || !!d.contacto_liberado_at;
        return (
          <TarjetaSistema
            icono="💳"
            titulo={pagada ? "Comisión de cierre pagada" : "Falta un último paso: la comisión de cierre"}
            texto={
              pagada
                ? rol === "fondeador"
                  ? `✓ Pagaste ${d.comision?.monto_cobro != null && d.comision?.moneda_cobro ? formatMonto(d.comision.monto_cobro, d.comision.moneda_cobro) : "la comisión"}. Gracias.`
                  : "✓ El fondeador pagó la comisión de ViaFactoring."
                : rol === "fondeador"
                  ? "Pagá la comisión de ViaFactoring para ver el contacto de la PyME y coordinar la transferencia."
                  : "El fondeador tiene que pagar la comisión de ViaFactoring. Después se muestra el contacto."
            }
            tono={pagada ? "good" : "accent"}
          >
            {!pagada && rol === "fondeador" && d.comision && (
              <p className="num text-sm font-semibold mt-2">
                {d.comision.monto_cobro != null && d.comision.moneda_cobro
                  ? formatMonto(d.comision.monto_cobro, d.comision.moneda_cobro)
                  : formatMonto(d.comision.monto_usd ?? d.comision.monto, "USD")}
              </p>
            )}
          </TarjetaSistema>
        );
      }
      if (kind === "contacto") {
        return (
          <TarjetaSistema icono="🔓" titulo="El contacto está disponible" tono="good">
            {d.nivel >= 4 || rol === "admin" ? (
              <div className="text-sm mt-2 flex flex-col gap-0.5">
                <span className="font-medium">{d.contraparte.empresa || d.contraparte.nombre}</span>
                {d.contraparte.telefono && <span>📞 {d.contraparte.telefono}</span>}
                {d.contraparte.email && <span>✉️ {d.contraparte.email}</span>}
                <span className="text-ink-soft mt-1">
                  El anticipo se transfiere directo entre ustedes, fuera de ViaFactoring.
                </span>
                <div className="flex gap-2 flex-wrap mt-3">
                  <a
                    href={`/api/contrato/${d.reveal_id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center min-h-10 px-3.5 rounded-full bg-ink text-white text-sm font-semibold"
                  >
                    📄 Contrato de cesión
                  </a>
                  {ofertaAceptada?.notifica_deudor && (
                    <a
                      href={`/api/contrato/${d.reveal_id}?doc=aviso`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center min-h-10 px-3.5 rounded-full border border-line-strong text-sm font-semibold"
                    >
                      ✉️ Aviso al deudor
                    </a>
                  )}
                </div>
                <span className="text-xs text-ink-soft mt-1.5">
                  Modelos prellenados con los datos de esta operación. Revisalos antes de firmar.
                </span>
                {rol === "fondeador" && devolucion !== undefined && (
                  <BloqueDevolucion revealId={d.reveal_id} bloqueo={devolucion} />
                )}
              </div>
            ) : null}
          </TarjetaSistema>
        );
      }
      if (kind === "fin") {
        return (
          <TarjetaSistema
            icono="✅"
            titulo="Operación finalizada"
            texto="El anticipo se transfirió directo entre las partes. Gracias por usar ViaFactoring."
            tono="good"
          />
        );
      }
      return <Pildora texto={m.cuerpo} fecha={m.created_at} />;
    }

    const mio = m.autor_rol === rol;
    const doc = m.document_id ? docsPorId.get(m.document_id) : null;
    return (
      <div className={`flex ${mio ? "justify-end" : "justify-start"}`}>
        <div
          className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${
            mio ? "bg-accent text-accent-ink rounded-br-md" : "bg-surface-2 text-ink rounded-bl-md"
          }`}
        >
          {!mio && <p className="text-xs font-semibold opacity-80 mb-0.5">{nombreRol(m.autor_rol, false)}</p>}
          {m.document_id && !doc ? (
            <p className="flex items-start gap-2">
              <span aria-hidden="true">🔒</span>
              <span>
                Compartió un documento con datos de contacto. Se habilita al cerrar el trato.
              </span>
            </p>
          ) : doc ? (
            <a
              href={`/api/documentos/${doc.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 underline font-medium break-all"
            >
              📄 {doc.nombre}
            </a>
          ) : (
            <p className="whitespace-pre-wrap break-words">{m.cuerpo}</p>
          )}
          {m.meta?.contacto_oculto && !m.cuerpo.startsWith("🔒") && (
            <p className={`text-[.72rem] mt-1.5 ${mio ? "opacity-85" : "text-ink-soft"}`}>
              🔒 Ocultamos datos de contacto. Se comparten al cerrar el trato.
            </p>
          )}
          {m.meta?.aviso_contacto && (
            <p className={`text-[.72rem] mt-1.5 ${mio ? "opacity-85" : "text-ink-soft"}`}>
              Recordá: la conversación sigue acá hasta cerrar el trato.
            </p>
          )}
          <p className="num text-[.7rem] opacity-70 mt-1 text-right">{formatFechaHora(m.created_at)}</p>
        </div>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-line bg-surface flex flex-col min-h-[70vh]">
      <div ref={hiloRef} className="flex-1 overflow-y-auto flex flex-col gap-3 p-4 max-h-[62vh]">
        {mensajes.length === 0 && (
          <p className="text-sm text-ink-soft text-center my-auto">Todavía no hay mensajes. Escribí para empezar.</p>
        )}
        {mensajes.map((m) => (
          <div key={m.id} id={`m-${m.id}`} className="scroll-mt-24">
            {renderMensaje(m)}
          </div>
        ))}
      </div>

      <div className="border-t border-line p-4 flex flex-col gap-3">
        {franja && (
          <FranjaTurno d={d} franja={franja} onContraofertar={(o) => setFormOferta({ contra: o })} />
        )}

        {formOferta && !soloLectura && (
          <FormOferta d={d} contraofertaDe={formOferta.contra} onCerrar={() => setFormOferta(null)} usdPorUnidad={usdPorUnidad} />
        )}

        {!soloLectura && (
          <>
            <div className="flex gap-2 items-end">
              <Textarea
                rows={2}
                value={texto}
                maxLength={4000}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    enviar();
                  }
                }}
                placeholder="Escribí un mensaje…"
                aria-label="Mensaje"
              />
              <Button onClick={enviar} disabled={pending || !texto.trim()} className="!py-2.5 !px-4 shrink-0">
                Enviar
              </Button>
            </div>
            {avisoContacto.length > 0 && d.nivel < 4 && (
              <p className="text-xs text-warn bg-warn-soft rounded-lg px-3 py-2">
                🔒 Los datos de contacto de este mensaje se van a ocultar. Se comparten solos cuando se cierra el
                trato, y seguir por fuera puede dar de baja la cuenta.
              </p>
            )}
            <ErrorText>{error}</ErrorText>
            <div className="flex gap-2 flex-wrap items-center">
              <form ref={archivoRef} action={subir}>
                <input type="hidden" name="reveal_id" value={d.reveal_id} />
                <input type="hidden" name="tipo" value="otro" />
                <label className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-line cursor-pointer hover:border-accent">
                  📎 {subiendo ? "Revisando y subiendo…" : "Adjuntar documento"}
                  <input
                    type="file"
                    name="archivo"
                    accept="application/pdf,image/jpeg,image/png"
                    className="hidden"
                    disabled={subiendo}
                    onChange={(e) => {
                      if (e.currentTarget.files?.length) e.currentTarget.form?.requestSubmit();
                    }}
                  />
                </label>
              </form>
              {puedeOfertar && !formOferta && (
                <button
                  type="button"
                  onClick={() => setFormOferta({ contra: null })}
                  className="inline-flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg border border-accent text-accent hover:bg-accent-soft"
                >
                  💰 Hacer una oferta
                </button>
              )}
            </div>
            {subida.error && <ErrorText>{subida.error}</ErrorText>}
            {subida.aviso && (
              <p className="text-xs text-warn bg-warn-soft rounded-lg px-3 py-2">🔒 {subida.aviso}</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}

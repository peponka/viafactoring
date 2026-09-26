import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card } from "@/components/ui";
import { formatFechaHora, formatMonto, TIPO_PAGO_LABEL } from "@/lib/format";
import type { AuditLog, ExceptionRow, PaymentEvent, PaymentRequest, Profile } from "@/lib/database.types";
import { AccionesExcepcion, TipoCambioManual } from "./acciones";

// Panel de excepciones: el admin solo interviene cuando algo no cuadra.
// El flujo normal (pagos, apertura del Deal Room, contacto) es automático.
const TIPO_LABEL: Record<string, string> = {
  pago_inconsistente: "Pago con importe o moneda distintos",
  webhook_invalido: "Aviso de pago con firma inválida",
  orden_desconocida: "Aviso de pago de una orden desconocida",
  pago_sin_aviso: "Pago sin confirmación de la pasarela",
  pago_duplicado: "Pago duplicado o que ya no hacía falta",
  sin_tipo_cambio: "Sin tipo de cambio vigente",
  reclamo: "Problema reportado por un usuario",
  error_tecnico: "Error técnico",
};

export default async function ExcepcionesPage({ searchParams }: PageProps<"/admin/excepciones">) {
  const verCerradas = (await searchParams).ver === "todas";
  const supabase = await createClient();

  let q = supabase.from("exceptions").select("*").order("created_at", { ascending: false }).limit(100);
  if (!verCerradas) q = q.eq("estado", "abierta");
  const { data: excepciones } = await q.returns<ExceptionRow[]>();
  const lista = excepciones ?? [];

  const reqIds = [...new Set(lista.map((e) => e.payment_request_id).filter(Boolean))] as string[];
  const evIds = [...new Set(lista.map((e) => e.payment_event_id).filter(Boolean))] as string[];
  const userIds = [...new Set(lista.map((e) => e.user_id).filter(Boolean))] as string[];
  const revealIds = [...new Set(lista.map((e) => e.reveal_id).filter(Boolean))] as string[];
  const excIds = lista.map((e) => e.id);

  const [{ data: pagos }, { data: eventos }, { data: perfiles }, { data: historial }] = await Promise.all([
    reqIds.length
      ? supabase.from("payment_requests").select("*").in("id", reqIds).returns<PaymentRequest[]>()
      : Promise.resolve({ data: [] as PaymentRequest[] }),
    evIds.length
      ? supabase.from("payment_events").select("*").in("id", evIds).returns<PaymentEvent[]>()
      : Promise.resolve({ data: [] as PaymentEvent[] }),
    userIds.length
      ? supabase.from("profiles").select("*").in("id", userIds).returns<Profile[]>()
      : Promise.resolve({ data: [] as Profile[] }),
    revealIds.length || excIds.length
      ? supabase
          .from("audit_logs")
          .select("*")
          .or(
            [
              revealIds.length ? `reveal_id.in.(${revealIds.join(",")})` : null,
              excIds.length ? `entidad_id.in.(${excIds.join(",")})` : null,
            ]
              .filter(Boolean)
              .join(","),
          )
          .order("created_at", { ascending: false })
          .limit(300)
          .returns<AuditLog[]>()
      : Promise.resolve({ data: [] as AuditLog[] }),
  ]);

  const hayTipoCambio = lista.some((e) => e.tipo === "sin_tipo_cambio" && e.estado === "abierta");

  return (
    <div>
      <div className="flex items-center justify-between gap-4 flex-wrap mb-2">
        <h1 className="text-2xl font-semibold">Excepciones</h1>
        <Link href={verCerradas ? "/admin/excepciones" : "/admin/excepciones?ver=todas"} className="text-sm underline text-ink-soft">
          {verCerradas ? "Ver solo abiertas" : "Ver también las cerradas"}
        </Link>
      </div>
      <p className="text-sm text-ink-soft mb-6">
        Casos que el sistema no pudo resolver solo. Cada intervención pide un motivo y queda registrada.
      </p>

      {hayTipoCambio && <TipoCambioManual />}

      {lista.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-soft">No hay excepciones {verCerradas ? "" : "abiertas"}. Todo está funcionando solo.</p>
        </Card>
      ) : (
        <div className="grid gap-4">
          {lista.map((e) => {
            const pago = pagos?.find((p) => p.id === e.payment_request_id);
            const evento = eventos?.find((ev) => ev.id === e.payment_event_id);
            const usuario = perfiles?.find((p) => p.id === e.user_id);
            const hist = (historial ?? []).filter(
              (h) => (e.reveal_id && h.reveal_id === e.reveal_id) || h.entidad_id === e.id,
            );
            return (
              <Card key={e.id} className="!p-5">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <p className="font-semibold">{TIPO_LABEL[e.tipo] ?? e.tipo}</p>
                    <p className="text-xs text-ink-soft">{formatFechaHora(e.created_at)}</p>
                  </div>
                  <Badge tone={e.estado === "abierta" ? "warn" : e.estado === "resuelta" ? "good" : "neutral"}>
                    {e.estado}
                  </Badge>
                </div>

                <p className="text-sm mt-3 whitespace-pre-wrap">{e.detalle}</p>

                <dl className="text-sm mt-3 grid sm:grid-cols-2 gap-x-6 gap-y-1">
                  {e.reveal_id && (
                    <div>
                      <dt className="inline text-ink-soft">Deal Room: </dt>
                      <dd className="inline">
                        <Link href={`/deal-room/${e.reveal_id}`} className="underline">
                          abrir
                        </Link>
                      </dd>
                    </div>
                  )}
                  {usuario && (
                    <div>
                      <dt className="inline text-ink-soft">Usuario: </dt>
                      <dd className="inline">
                        {usuario.nombre} ({usuario.role})
                      </dd>
                    </div>
                  )}
                  {pago && (
                    <>
                      <div>
                        <dt className="inline text-ink-soft">Pago: </dt>
                        <dd className="inline">
                          {TIPO_PAGO_LABEL[pago.tipo]} ·{" "}
                          {pago.monto_cobro != null && pago.moneda_cobro
                            ? formatMonto(pago.monto_cobro, pago.moneda_cobro)
                            : formatMonto(pago.monto, pago.moneda)}{" "}
                          · {pago.estado}
                        </dd>
                      </div>
                      <div className="break-all">
                        <dt className="inline text-ink-soft">Referencia: </dt>
                        <dd className="inline">
                          {pago.provider ?? "—"} {pago.provider_ref ?? ""}
                        </dd>
                      </div>
                    </>
                  )}
                </dl>

                {evento && (
                  <details className="mt-3 text-xs">
                    <summary className="cursor-pointer text-ink-soft">
                      Aviso de la pasarela · {evento.estado_informado ?? "?"} · firma {evento.firma_valida ? "válida" : "inválida"} ·{" "}
                      {formatFechaHora(evento.recibido_at)}
                    </summary>
                    <pre className="mt-2 bg-surface-2 rounded-lg p-3 overflow-x-auto">{JSON.stringify(evento.payload, null, 2)}</pre>
                  </details>
                )}
                {Object.keys(e.datos ?? {}).length > 0 && (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-ink-soft">Datos</summary>
                    <pre className="mt-2 bg-surface-2 rounded-lg p-3 overflow-x-auto">{JSON.stringify(e.datos, null, 2)}</pre>
                  </details>
                )}
                {hist.length > 0 && (
                  <details className="mt-2 text-xs">
                    <summary className="cursor-pointer text-ink-soft">Historial ({hist.length})</summary>
                    <ul className="mt-2 flex flex-col gap-1">
                      {hist.map((h) => (
                        <li key={h.id} className="num">
                          {formatFechaHora(h.created_at)} · {h.accion}
                          {h.actor_rol ? ` · ${h.actor_rol}` : ""}
                        </li>
                      ))}
                    </ul>
                  </details>
                )}

                {e.estado === "abierta" ? (
                  <AccionesExcepcion id={e.id} conPago={!!pago} />
                ) : (
                  e.resolucion && <p className="text-sm text-ink-soft mt-3">Resolución: {e.resolucion}</p>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

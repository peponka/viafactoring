import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserAndProfile } from "@/lib/session";
import { Badge, Card } from "@/components/ui";
import {
  ESTADO_DEAL_ROOM_LABEL,
  RIESGO_LABEL,
  descuentoImplicito,
  estadoDealRoomTone,
  formatFecha,
  formatMonto,
  formatPct,
  rubroLabel,
} from "@/lib/format";
import type { DealRoomDetail, Invoice, Offer, Reveal } from "@/lib/database.types";
import { RetirarButton } from "./retirar-button";
import { explicarOferta } from "@/lib/ofertas";

// La factura de la PyME y sus Deal Rooms. La comparación de ofertas es la
// razón concreta para negociar adentro: varios fondeadores en paralelo,
// medidos con la misma vara.
export default async function FacturaDetallePage({
  params,
}: PageProps<"/operador/facturas/[id]">) {
  const { id } = await params;
  const { profile } = await getUserAndProfile();
  const supabase = await createClient();

  const { data: factura } = await supabase
    .from("invoices")
    .select("*")
    .eq("id", id)
    .eq("operador_id", profile!.id)
    .single<Invoice>();

  if (!factura) notFound();

  const [{ data: rooms }, { data: ofertas }] = await Promise.all([
    supabase
      .from("reveals")
      .select("*")
      .eq("invoice_id", id)
      .order("ultima_actividad_at", { ascending: false })
      .returns<Reveal[]>(),
    supabase.from("offers").select("*").eq("invoice_id", id).returns<Offer[]>(),
  ]);

  const detalles = await Promise.all(
    (rooms ?? []).map((r) =>
      supabase
        .rpc("get_deal_room_detail", { p_reveal_id: r.id })
        .then(({ data }) => data as DealRoomDetail | null),
    ),
  );

  const filas = (rooms ?? []).map((r, i) => {
    const d = detalles[i];
    const delRoom = (ofertas ?? []).filter((o) => o.reveal_id === r.id);
    const vigente =
      delRoom.find((o) => o.estado === "aceptada") ?? delRoom.find((o) => o.estado === "pendiente");
    return {
      room: r,
      fondeador: d?.contraparte.empresa || d?.contraparte.nombre || "Fondeador",
      vigente,
      calc: vigente
        ? descuentoImplicito(factura.monto, vigente.monto_ofrecido, factura.fecha_vencimiento, factura.plazo_dias)
        : null,
    };
  });

  const conOferta = filas.filter((f) => f.vigente);

  const { data: alcanceFilas } = await supabase.rpc("alcance_factura", {
    p_monto: factura.monto,
    p_moneda: factura.moneda,
    p_plazo_dias: factura.plazo_dias,
    p_riesgo: factura.riesgo,
    p_deudor_tipo: factura.deudor_tipo,
    p_rubro: factura.rubro,
  });
  const alcance = Array.isArray(alcanceFilas) ? alcanceFilas[0] : null;

  return (
    <div className="max-w-4xl">
      <section className="bg-surface border border-line rounded-3xl p-5 sm:p-6 mb-6 shadow-[var(--shadow-card)] flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Badge>{rubroLabel(factura.rubro)}</Badge>
              <Badge>{factura.deudor_tipo === "estado" ? "Deudor: Estado" : "Empresa privada"}</Badge>
              <Badge>{RIESGO_LABEL[factura.riesgo]}</Badge>
            </div>
            <p className="text-sm text-ink-soft">
              {factura.numero ? `Factura ${factura.numero}` : "Factura"} · {factura.deudor_nombre}
            </p>
            <h1 className="num text-[2rem] sm:text-[2.4rem] font-semibold leading-tight">
              {formatMonto(factura.monto, factura.moneda)}
            </h1>
            <p className="text-ink-soft text-sm">
              Vence {formatFecha(factura.fecha_vencimiento)} · {factura.plazo_dias} días
            </p>
          </div>
          <Badge tone={factura.estado === "disponible" ? "good" : factura.estado === "cerrada" ? "gold" : "neutral"}>
            {factura.estado === "disponible" ? "Publicada" : factura.estado === "cerrada" ? "Cerrada" : "Retirada"}
          </Badge>
        </div>
        <div className="grid grid-cols-3 gap-2.5">
          <div className="bg-surface-2 rounded-2xl px-3 py-3 text-center">
            <p className="num text-2xl font-bold">{alcance ? alcance.instituciones + alcance.inversores : "—"}</p>
            <p className="text-xs text-ink-soft">fondeadores encajan</p>
          </div>
          <div className="bg-surface-2 rounded-2xl px-3 py-3 text-center">
            <p className="num text-2xl font-bold">{filas.length}</p>
            <p className="text-xs text-ink-soft">{filas.length === 1 ? "interesado" : "interesados"}</p>
          </div>
          <div className={`rounded-2xl px-3 py-3 text-center ${conOferta.length > 0 ? "bg-accent-soft text-accent" : "bg-surface-2"}`}>
            <p className="num text-2xl font-bold">{conOferta.length}</p>
            <p className="text-xs font-medium">{conOferta.length === 1 ? "oferta" : "ofertas"}</p>
          </div>
        </div>
      </section>

      {conOferta.length > 0 && (
        <section className="mb-6 flex flex-col gap-3">
          <div className="flex items-end justify-between gap-3 flex-wrap">
            <h2 className="text-xl font-bold">Ofertas, explicadas en simple</h2>
            <p className="text-xs text-ink-soft">Ordenadas por anticipo. Para vos es gratis aceptar.</p>
          </div>
          {conOferta
            .sort((a, b) => (b.vigente!.monto_ofrecido ?? 0) - (a.vigente!.monto_ofrecido ?? 0))
            .map((f, i) => {
              const o = f.vigente!;
              const exp = explicarOferta({
                montoFactura: factura.monto,
                anticipo: o.monto_ofrecido,
                moneda: factura.moneda,
                vencimiento: factura.fecha_vencimiento,
                plazoDias: factura.plazo_dias,
                conRecurso: o.con_recurso,
                notificaDeudor: o.notifica_deudor,
                fechaPago: o.fecha_pago_prevista,
              });
              const responder = o.estado === "pendiente" && o.autor_rol === "fondeador";
              return (
                <article
                  key={f.room.id}
                  className={`bg-surface rounded-3xl p-5 flex flex-col gap-4 shadow-[var(--shadow-card)] border ${i === 0 ? "border-2 border-accent" : "border-line"}`}
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div>
                      <p className="font-bold">{f.fondeador}</p>
                      <p className="text-xs text-ink-soft">
                        {o.estado === "aceptada" ? "Oferta aceptada" : responder ? "Esperando tu respuesta" : "Oferta en curso"}
                      </p>
                    </div>
                    {i === 0 && conOferta.length > 1 && (
                      <span className="text-[11px] font-bold bg-surface-3 px-2.5 py-1 rounded-full">Mayor anticipo</span>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="bg-surface-2 rounded-2xl px-3 py-2.5">
                      <p className="text-[11px] text-ink-soft">Te adelanta</p>
                      <p className="num font-semibold">{formatMonto(o.monto_ofrecido, factura.moneda)}</p>
                    </div>
                    <div className="bg-surface-2 rounded-2xl px-3 py-2.5">
                      <p className="text-[11px] text-ink-soft">Descuento</p>
                      <p className="num font-semibold">{formatPct(exp.descuento)}</p>
                    </div>
                    <div className="bg-surface-2 rounded-2xl px-3 py-2.5">
                      <p className="text-[11px] text-ink-soft">Anual aprox.</p>
                      <p className="num font-semibold">{formatPct(exp.anual)}</p>
                    </div>
                  </div>
                  <ul className="flex flex-col gap-1.5 text-sm">
                    {exp.frases.map((t) => (
                      <li key={t} className="flex gap-2">
                        <span aria-hidden="true" className="text-accent font-bold">·</span>
                        <span>{t}</span>
                      </li>
                    ))}
                  </ul>
                  <Link
                    href={`/deal-room/${f.room.id}`}
                    className={`min-h-12 rounded-full font-bold flex items-center justify-center ${responder ? "bg-accent text-white" : "border border-line-strong"}`}
                  >
                    {responder ? "Responder la oferta" : "Abrir la negociación"}
                  </Link>
                </article>
              );
            })}
          <p className="text-xs text-ink-soft">
            El descuento es la diferencia entre el monto de la factura y el anticipo. El anual es una referencia
            aritmética para comparar ofertas con distinto plazo, no una tasa de mercado.
          </p>
        </section>
      )}

      <Card className="mb-6">
        <p className="font-semibold mb-3">
          {filas.length === 0 ? "Interesados" : `${filas.length} ${filas.length === 1 ? "fondeador se interesó" : "fondeadores se interesaron"}`}
        </p>
        {filas.length === 0 ? (
          <p className="text-sm text-ink-soft">
            Todavía nadie marcó interés. Cuando un fondeador lo haga, se abre una negociación para
            conversar y recibir su oferta.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {filas.map((f) => (
              <li key={f.room.id}>
                <Link
                  href={`/deal-room/${f.room.id}`}
                  className="flex items-center justify-between gap-3 rounded-2xl px-3.5 py-3 min-h-12 hover:bg-surface-2 transition text-sm"
                >
                  <span>
                    <span className="font-medium">{f.fondeador}</span>
                    <span className="text-ink-soft"> · desde el {formatFecha(f.room.revealed_at)}</span>
                  </span>
                  <Badge tone={estadoDealRoomTone(f.room.estado)}>
                    {ESTADO_DEAL_ROOM_LABEL[f.room.estado]}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {factura.estado === "disponible" && (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-ink-soft">
            La factura se cierra aceptando una oferta en su Deal Room. Si ya no querés ofrecerla,
            podés retirarla.
          </p>
          <RetirarButton invoiceId={factura.id} />
        </div>
      )}
    </div>
  );
}

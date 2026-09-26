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

function siNo(v: boolean | null) {
  return v === true ? "Sí" : v === false ? "No" : "—";
}

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

  return (
    <div className="max-w-4xl">
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <Badge>{rubroLabel(factura.rubro)}</Badge>
        <Badge>{RIESGO_LABEL[factura.riesgo]}</Badge>
        <Badge tone={factura.estado === "disponible" ? "good" : "neutral"}>{factura.estado}</Badge>
      </div>
      <h1 className="text-2xl font-semibold mb-1">{factura.deudor_nombre}</h1>
      <p className="text-ink-soft mb-6">
        {formatMonto(factura.monto, factura.moneda)} · vence {formatFecha(factura.fecha_vencimiento)} ·{" "}
        {factura.plazo_dias} días
      </p>

      {conOferta.length > 0 && (
        <Card className="mb-6 overflow-x-auto">
          <p className="font-semibold mb-3">Comparar ofertas</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-ink-soft text-xs uppercase tracking-wide">
                <th className="py-2 pr-3">Fondeador</th>
                <th className="py-2 pr-3">Anticipo</th>
                <th className="py-2 pr-3">Descuento</th>
                <th className="py-2 pr-3">Con recurso</th>
                <th className="py-2 pr-3">Notifica deudor</th>
                <th className="py-2 pr-3">Pago previsto</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {conOferta
                .sort((a, b) => (b.vigente!.monto_ofrecido ?? 0) - (a.vigente!.monto_ofrecido ?? 0))
                .map((f) => (
                  <tr key={f.room.id} className="border-t border-line">
                    <td className="py-2 pr-3 font-medium">{f.fondeador}</td>
                    <td className="py-2 pr-3 num">{formatMonto(f.vigente!.monto_ofrecido, factura.moneda)}</td>
                    <td className="py-2 pr-3 num">
                      {formatPct(f.calc?.descuento)}
                      {f.calc?.anual != null && (
                        <span className="text-ink-soft"> (~{formatPct(f.calc.anual)} anual)</span>
                      )}
                    </td>
                    <td className="py-2 pr-3">{siNo(f.vigente!.con_recurso)}</td>
                    <td className="py-2 pr-3">{siNo(f.vigente!.notifica_deudor)}</td>
                    <td className="py-2 pr-3 num">{formatFecha(f.vigente!.fecha_pago_prevista)}</td>
                    <td className="py-2">
                      <Link href={`/deal-room/${f.room.id}`} className="text-accent font-medium">
                        {f.vigente!.estado === "pendiente" && f.vigente!.autor_rol === "fondeador"
                          ? "Responder →"
                          : "Abrir →"}
                      </Link>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
          <p className="text-xs text-ink-soft mt-3">
            El descuento es la diferencia entre el monto de la factura y el anticipo; el anual es una
            referencia aritmética simple para comparar ofertas con distinto plazo.
          </p>
        </Card>
      )}

      <Card className="mb-6">
        <p className="font-semibold mb-3">
          {filas.length} fondeador(es) desbloquearon esta factura
        </p>
        {filas.length === 0 ? (
          <p className="text-sm text-ink-soft">
            Todavía nadie la desbloqueó. Cuando un fondeador lo haga, se abre un Deal Room para
            conversar y recibir su oferta.
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {filas.map((f) => (
              <li key={f.room.id}>
                <Link
                  href={`/deal-room/${f.room.id}`}
                  className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 hover:bg-surface-2 transition text-sm"
                >
                  <span>
                    <span className="font-medium">{f.fondeador}</span>
                    <span className="text-ink-soft"> · desbloqueó el {formatFecha(f.room.revealed_at)}</span>
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
            podés retirarla del marketplace.
          </p>
          <RetirarButton invoiceId={factura.id} />
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserAndProfile } from "@/lib/session";
import { Badge, EmptyState, LinkButton, PageHeader } from "@/components/ui";
import { ESTADO_FACTURA_LABEL, rubroLabel, formatFecha, formatMonto } from "@/lib/format";
import type { Invoice, Offer, Reveal } from "@/lib/database.types";
import { getMisDealRooms } from "@/lib/deal-rooms";
import { TeTocaAVos } from "@/components/deal-room-list";

function estadoTone(estado: string) {
  if (estado === "disponible") return "good" as const;
  if (estado === "cerrada") return "gold" as const;
  return "neutral" as const;
}

export default async function OperadorPage() {
  const { profile } = await getUserAndProfile();
  const supabase = await createClient();

  const { data: facturas } = await supabase
    .from("invoices")
    .select("*")
    .eq("operador_id", profile!.id)
    .order("created_at", { ascending: false })
    .returns<Invoice[]>();

  const ids = (facturas ?? []).map((f) => f.id);
  const [rooms, { data: reveals }, { data: ofertas }] = await Promise.all([
    getMisDealRooms("operador"),
    ids.length
      ? supabase.from("reveals").select("id, invoice_id").in("invoice_id", ids).returns<Pick<Reveal, "id" | "invoice_id">[]>()
      : Promise.resolve({ data: [] as Pick<Reveal, "id" | "invoice_id">[] }),
    ids.length
      ? supabase.from("offers").select("id, invoice_id, estado").in("invoice_id", ids).returns<Pick<Offer, "id" | "invoice_id" | "estado">[]>()
      : Promise.resolve({ data: [] as Pick<Offer, "id" | "invoice_id" | "estado">[] }),
  ]);

  const interesados = (id: string) => (reveals ?? []).filter((r) => r.invoice_id === id).length;
  const ofertasActivas = (id: string) =>
    (ofertas ?? []).filter((o) => o.invoice_id === id && (o.estado === "pendiente" || o.estado === "aceptada")).length;
  const publicadas = (facturas ?? []).filter((f) => f.estado === "disponible");
  const totalPublicado = publicadas.length;

  return (
    <div>
      <PageHeader
        title="Mis facturas"
        subtitle={
          facturas && facturas.length > 0
            ? `${totalPublicado} publicada${totalPublicado === 1 ? "" : "s"} · ${(reveals ?? []).length} interesado${(reveals ?? []).length === 1 ? "" : "s"} en total`
            : "Subí una factura y recibí ofertas de fondeadores verificados."
        }
        action={<LinkButton href="/operador/nueva" className="hidden sm:inline-flex">+ Subir factura</LinkButton>}
      />

      <TeTocaAVos rooms={rooms} />

      {!facturas || facturas.length === 0 ? (
        <EmptyState
          title="Todavía no subiste facturas"
          action={<LinkButton href="/operador/nueva">Subir mi primera factura</LinkButton>}
        >
          Es gratis, siempre. Sacale una foto y la IA completa los datos.
        </EmptyState>
      ) : (
        <div className="grid gap-3">
          {facturas.map((f) => {
            const n = interesados(f.id);
            const o = ofertasActivas(f.id);
            return (
              <Link
                key={f.id}
                href={`/operador/facturas/${f.id}`}
                className="block bg-surface border border-line rounded-3xl p-5 shadow-[var(--shadow-card)] hover:border-line-strong transition"
              >
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-2 flex-wrap">
                      <Badge tone={estadoTone(f.estado)}>{ESTADO_FACTURA_LABEL[f.estado]}</Badge>
                      <Badge>{rubroLabel(f.rubro)}</Badge>
                    </div>
                    <p className="num text-2xl font-semibold leading-tight">{formatMonto(f.monto, f.moneda)}</p>
                    <p className="text-ink-soft text-sm mt-0.5 truncate">
                      {f.deudor_nombre} · vence {formatFecha(f.fecha_vencimiento)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <span className="rounded-2xl bg-surface-2 px-3.5 py-2 text-center min-w-[84px]">
                      <span className="block num text-lg font-bold">{n}</span>
                      <span className="block text-[11px] text-ink-soft">{n === 1 ? "interesado" : "interesados"}</span>
                    </span>
                    <span className={`rounded-2xl px-3.5 py-2 text-center min-w-[84px] ${o > 0 ? "bg-accent-soft text-accent" : "bg-surface-2"}`}>
                      <span className="block num text-lg font-bold">{o}</span>
                      <span className="block text-[11px]">{o === 1 ? "oferta" : "ofertas"}</span>
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

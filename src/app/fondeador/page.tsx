import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card } from "@/components/ui";
import { formatFecha, formatMonto, RIESGO_LABEL, rubroLabel } from "@/lib/format";
import type { InvoiceTeaser } from "@/lib/database.types";
import { getMisDealRooms } from "@/lib/deal-rooms";
import { TeTocaAVos } from "@/components/deal-room-list";

function riesgoTone(riesgo: string) {
  if (riesgo === "bajo") return "good" as const;
  if (riesgo === "alto") return "critical" as const;
  return "warn" as const;
}

export default async function FondeadorMarketplacePage({
  searchParams,
}: PageProps<"/fondeador">) {
  const { industria } = await searchParams;
  const filtro = typeof industria === "string" ? industria : null;
  const supabase = await createClient();
  const [{ data: todas }, rooms] = await Promise.all([
    supabase
      .from("invoice_teasers")
      .select("*")
      .order("created_at", { ascending: false })
      .returns<InvoiceTeaser[]>(),
    getMisDealRooms("fondeador"),
  ]);

  // Industrias presentes en el marketplace (el filtro usa la industria padre
  // cuando existe: "Transporte" incluye fluvial y terrestre).
  const grupo = (t: InvoiceTeaser) => t.industria_padre_nombre ?? t.industria_nombre ?? "Otros";
  const industrias = [...new Set((todas ?? []).map(grupo))].sort();
  const teasers = filtro ? (todas ?? []).filter((t) => grupo(t) === filtro) : todas;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Marketplace de operaciones</h1>
      <p className="text-ink-soft text-sm mb-6">
        Explorá gratis el monto, el plazo y los datos del sector de cada
        operación. Para ver el deudor, la documentación y negociar,
        desbloqueá la operación y entrá a su Deal Room.
      </p>

      <TeTocaAVos rooms={rooms} />

      {industrias.length > 1 && (
        <div className="flex items-center gap-2 flex-wrap mb-6 text-sm">
          <Link
            href="/fondeador"
            className={`px-3 py-1.5 rounded-full border ${!filtro ? "border-accent text-accent font-semibold" : "border-line text-ink-soft"}`}
          >
            Todas
          </Link>
          {industrias.map((nombre) => (
            <Link
              key={nombre}
              href={`/fondeador?industria=${encodeURIComponent(nombre)}`}
              className={`px-3 py-1.5 rounded-full border ${filtro === nombre ? "border-accent text-accent font-semibold" : "border-line text-ink-soft"}`}
            >
              {nombre}
            </Link>
          ))}
        </div>
      )}

      {!teasers || teasers.length === 0 ? (
        <Card className="text-center py-16">
          <p className="font-serif text-xl mb-2">Todavía no hay operaciones cargadas</p>
          <p className="text-ink-soft">
            Apenas un operador cargue una factura disponible, la vas a ver acá.
          </p>
        </Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-4">
          {teasers.map((t) => (
            <Link key={t.id} href={`/fondeador/facturas/${t.id}`} className="block">
              <Card className="hover:border-accent transition h-full flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-3 flex-wrap">
                    <Badge>{t.industria_nombre ?? rubroLabel(t.rubro)}</Badge>
                    <Badge tone={riesgoTone(t.riesgo)}>
                      {RIESGO_LABEL[t.riesgo]}
                    </Badge>
                    {t.ya_revelada && <Badge tone="good">En tu Deal Room</Badge>}
                    {t.estado !== "disponible" && !t.ya_revelada && (
                      <Badge tone="neutral">{t.estado}</Badge>
                    )}
                  </div>
                  {t.descripcion && (
                    <p className="text-sm text-ink-soft mb-3 line-clamp-2">
                      {t.descripcion}
                    </p>
                  )}
                  {Object.keys(t.industry_data_publica ?? {}).length > 0 && (
                    <p className="text-xs text-ink-soft mb-3">
                      {Object.entries(t.industry_data_publica)
                        .map(([k, v]) => `${k.replaceAll("_", " ")}: ${String(v)}`)
                        .join(" · ")}
                    </p>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3 text-sm mt-2">
                  <div>
                    <p className="text-ink-soft text-xs uppercase tracking-wide">
                      Monto
                    </p>
                    <p className="num font-medium">
                      {formatMonto(t.monto, t.moneda)}
                    </p>
                  </div>
                  <div>
                    <p className="text-ink-soft text-xs uppercase tracking-wide">
                      Vencimiento
                    </p>
                    <p className="num font-medium">
                      {formatFecha(t.fecha_vencimiento)}
                    </p>
                  </div>
                </div>
                {!t.ya_revelada && (
                  <p className="text-xs text-ink-soft mt-3">
                    Desbloquear: {formatMonto(t.unlock_fee, "USD")}
                  </p>
                )}
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Badge, Card } from "@/components/ui";
import { formatFecha, formatMonto, RIESGO_LABEL, RUBRO_LABEL } from "@/lib/format";
import type { InvoiceTeaser } from "@/lib/database.types";

function riesgoTone(riesgo: string) {
  if (riesgo === "bajo") return "good" as const;
  if (riesgo === "alto") return "critical" as const;
  return "warn" as const;
}

export default async function FondeadorMarketplacePage() {
  const supabase = await createClient();
  const { data: teasers } = await supabase
    .from("invoice_teasers")
    .select("*")
    .order("created_at", { ascending: false })
    .returns<InvoiceTeaser[]>();

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Marketplace de operaciones</h1>
      <p className="text-ink-soft text-sm mb-8">
        Explorá gratis el monto, el plazo y el riesgo de cada operación.
        Para ver el deudor, el contacto del operador y la documentación,
        desbloqueá la operación que te interese.
      </p>

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
                    <Badge>{RUBRO_LABEL[t.rubro]}</Badge>
                    <Badge tone={riesgoTone(t.riesgo)}>
                      {RIESGO_LABEL[t.riesgo]}
                    </Badge>
                    {t.ya_revelada && <Badge tone="good">Desbloqueada</Badge>}
                    {t.estado !== "disponible" && !t.ya_revelada && (
                      <Badge tone="neutral">{t.estado}</Badge>
                    )}
                  </div>
                  {t.descripcion && (
                    <p className="text-sm text-ink-soft mb-3 line-clamp-2">
                      {t.descripcion}
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
                    Desbloquear: {formatMonto(t.unlock_fee, t.moneda)}
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

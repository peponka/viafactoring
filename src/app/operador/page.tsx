import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { getUserAndProfile } from "@/lib/session";
import { Badge, Card, LinkButton } from "@/components/ui";
import {
  ESTADO_FACTURA_LABEL,
  rubroLabel,
  formatFecha,
  formatMonto,
} from "@/lib/format";
import type { Invoice } from "@/lib/database.types";

function estadoTone(estado: string) {
  if (estado === "disponible") return "good" as const;
  if (estado === "cerrada") return "gold" as const;
  return "neutral" as const;
}

function riesgoTone(riesgo: string) {
  if (riesgo === "bajo") return "good" as const;
  if (riesgo === "alto") return "critical" as const;
  return "warn" as const;
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

  const { count: revelosCount } = await supabase
    .from("reveals")
    .select("id, invoices!inner(operador_id)", { count: "exact", head: true })
    .eq("invoices.operador_id", profile!.id);

  return (
    <div>
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Mis facturas</h1>
          <p className="text-ink-soft text-sm mt-1">
            {facturas?.length ?? 0} factura(s) cargada(s)
            {typeof revelosCount === "number"
              ? ` · ${revelosCount} vista(s) por fondeadores`
              : ""}
          </p>
        </div>
        <LinkButton href="/operador/nueva">+ Cargar factura</LinkButton>
      </div>

      {!facturas || facturas.length === 0 ? (
        <Card className="text-center py-16">
          <p className="font-serif text-xl mb-2">Todavía no cargaste facturas</p>
          <p className="text-ink-soft mb-6">
            Subí tu primera factura pendiente de cobro — es gratis, siempre.
          </p>
          <LinkButton href="/operador/nueva">Cargar mi primera factura</LinkButton>
        </Card>
      ) : (
        <div className="grid gap-3">
          {facturas.map((f) => (
            <Link key={f.id} href={`/operador/facturas/${f.id}`} className="block">
            <Card className="!p-5 hover:border-accent transition">
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge tone={estadoTone(f.estado)}>
                      {ESTADO_FACTURA_LABEL[f.estado]}
                    </Badge>
                    <Badge>{rubroLabel(f.rubro)}</Badge>
                    <Badge tone={riesgoTone(f.riesgo)}>{f.riesgo}</Badge>
                  </div>
                  <p className="font-serif text-lg font-medium">
                    {f.deudor_nombre}
                    {f.numero ? ` · Nº ${f.numero}` : ""}
                  </p>
                  <p className="text-ink-soft text-sm mt-1">
                    {formatMonto(f.monto, f.moneda)} · vence{" "}
                    {formatFecha(f.fecha_vencimiento)} · {f.plazo_dias} días de
                    plazo
                  </p>
                </div>
                <span className="num text-xs text-ink-soft">
                  cargada {formatFecha(f.created_at)}
                </span>
              </div>
            </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

import { createClient } from "@/lib/supabase/server";
import { getUserAndProfile } from "@/lib/session";
import { Badge, Card } from "@/components/ui";
import { formatFecha, formatMonto } from "@/lib/format";
import type { CreditPack, CreditTransaction, PaymentRequest } from "@/lib/database.types";
import { SolicitarPackForm } from "./solicitar-form";

const TIPO_LABEL: Record<string, string> = {
  bienvenida: "Bienvenida",
  compra: "Compra",
  consumo: "Factura revelada",
  ajuste_admin: "Ajuste",
};

export default async function CreditosPage() {
  const { profile } = await getUserAndProfile();
  const supabase = await createClient();

  const [{ data: credit }, { data: packs }, { data: transacciones }, { data: pagos }] =
    await Promise.all([
      supabase
        .from("fondeador_credits")
        .select("balance")
        .eq("fondeador_id", profile!.id)
        .single(),
      supabase
        .from("credit_packs")
        .select("*")
        .eq("activo", true)
        .order("cantidad_creditos", { ascending: true })
        .returns<CreditPack[]>(),
      supabase
        .from("credit_transactions")
        .select("*")
        .eq("fondeador_id", profile!.id)
        .order("created_at", { ascending: false })
        .limit(30)
        .returns<CreditTransaction[]>(),
      supabase
        .from("payment_requests")
        .select("*")
        .eq("fondeador_id", profile!.id)
        .order("created_at", { ascending: false })
        .returns<PaymentRequest[]>(),
    ]);

  const pendientes = pagos?.filter((p) => p.estado === "pendiente") ?? [];

  return (
    <div className="grid md:grid-cols-[1fr_1.2fr] gap-8">
      <div>
        <h1 className="text-2xl font-semibold mb-1">Créditos</h1>
        <Card className="my-6 text-center py-8">
          <p className="text-ink-soft text-sm mb-1">Saldo actual</p>
          <p className="font-serif text-4xl">{credit?.balance ?? 0}</p>
        </Card>

        {pendientes.length > 0 && (
          <Card className="mb-6 border-gold bg-gold-soft/30">
            <p className="font-semibold mb-2">Pagos pendientes de confirmar</p>
            {pendientes.map((p) => (
              <div key={p.id} className="text-sm text-ink-soft py-1">
                {formatMonto(p.monto, p.moneda)} — solicitado el{" "}
                {formatFecha(p.created_at)}
                {p.payment_link && (
                  <>
                    {" · "}
                    <a
                      href={p.payment_link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-accent underline"
                    >
                      pagar acá
                    </a>
                  </>
                )}
              </div>
            ))}
          </Card>
        )}

        <p className="text-sm font-semibold text-ink-soft mb-3">Packs disponibles</p>
        {!packs || packs.length === 0 ? (
          <Card>
            <p className="text-sm text-ink-soft">
              Todavía no hay packs de crédito configurados. Escribinos y te
              armamos uno a medida.
            </p>
          </Card>
        ) : (
          <div className="grid gap-3">
            {packs.map((pack) => (
              <Card key={pack.id} className="flex items-center justify-between gap-4">
                <div>
                  <p className="font-semibold">{pack.nombre}</p>
                  <p className="text-sm text-ink-soft">
                    {pack.cantidad_creditos} créditos ·{" "}
                    {formatMonto(pack.precio, pack.moneda)}
                  </p>
                </div>
                <SolicitarPackForm pack={pack} />
              </Card>
            ))}
          </div>
        )}
      </div>

      <div>
        <p className="text-sm font-semibold text-ink-soft mb-3">Historial</p>
        <Card className="!p-0 overflow-hidden">
          {!transacciones || transacciones.length === 0 ? (
            <p className="text-sm text-ink-soft p-6">Sin movimientos todavía.</p>
          ) : (
            <ul className="divide-y divide-line">
              {transacciones.map((t) => (
                <li key={t.id} className="flex items-center justify-between px-5 py-3">
                  <div>
                    <p className="text-sm font-medium">{TIPO_LABEL[t.tipo]}</p>
                    <p className="text-xs text-ink-soft">{formatFecha(t.created_at)}</p>
                  </div>
                  <Badge tone={t.cantidad >= 0 ? "good" : "neutral"}>
                    {t.cantidad >= 0 ? "+" : ""}
                    {t.cantidad}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

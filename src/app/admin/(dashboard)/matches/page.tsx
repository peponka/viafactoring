import { createClient } from "@/lib/supabase/server";
import { Badge, Card } from "@/components/ui";
import Link from "next/link";
import { ESTADO_DEAL_ROOM_LABEL, estadoDealRoomTone, formatFecha } from "@/lib/format";
import type { Invoice, Profile, Reveal } from "@/lib/database.types";

export default async function AdminMatchesPage() {
  const supabase = await createClient();
  const { data: reveals } = await supabase
    .from("reveals")
    .select("*")
    .order("revealed_at", { ascending: false })
    .returns<Reveal[]>();

  const invoiceIds = [...new Set((reveals ?? []).map((r) => r.invoice_id))];
  const fondeadorIds = [...new Set((reveals ?? []).map((r) => r.fondeador_id))];

  const [{ data: invoices }, { data: perfiles }] = await Promise.all([
    invoiceIds.length
      ? supabase.from("invoices").select("*").in("id", invoiceIds).returns<Invoice[]>()
      : Promise.resolve({ data: [] as Invoice[] }),
    fondeadorIds.length
      ? supabase.from("profiles").select("*").in("id", fondeadorIds).returns<Profile[]>()
      : Promise.resolve({ data: [] as Profile[] }),
  ]);

  const invoiceDe = (id: string) => invoices?.find((i) => i.id === id);
  const fondeadorDe = (id: string) => perfiles?.find((p) => p.id === id);

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Deal Rooms</h1>
      {!reveals || reveals.length === 0 ? (
        <Card>
          <p className="text-ink-soft text-sm">
            Todavía nadie desbloqueó ninguna factura.
          </p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {reveals.map((r) => {
            const invoice = invoiceDe(r.invoice_id);
            const fondeador = fondeadorDe(r.fondeador_id);
            return (
              <Card key={r.id} className="flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-medium">
                    {fondeador?.nombre ?? r.fondeador_id} →{" "}
                    {invoice?.deudor_nombre ?? r.invoice_id}
                  </p>
                  <p className="text-sm text-ink-soft">
                    revelado {formatFecha(r.revealed_at)}
                    {r.bitacora ? ` · ${r.bitacora}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <Badge tone={estadoDealRoomTone(r.estado)}>
                    {ESTADO_DEAL_ROOM_LABEL[r.estado] ?? r.estado}
                  </Badge>
                  <Link href={`/deal-room/${r.id}`} className="text-accent text-sm font-medium">
                    Ver →
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

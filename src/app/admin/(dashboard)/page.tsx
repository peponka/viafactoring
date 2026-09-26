import { createClient } from "@/lib/supabase/server";
import { Card, LinkButton } from "@/components/ui";
import type { Database } from "@/lib/database.types";

type TableName = keyof Database["public"]["Tables"];

async function count(
  supabase: Awaited<ReturnType<typeof createClient>>,
  table: TableName,
  filter?: Record<string, string>,
) {
  let q = supabase.from(table).select("*", { count: "exact", head: true });
  if (filter) {
    for (const [k, v] of Object.entries(filter)) q = q.eq(k, v);
  }
  const { count } = await q;
  return count ?? 0;
}

export default async function AdminOverviewPage() {
  const supabase = await createClient();

  const [operadores, fondeadores, facturas, disponibles, revelos, pendientes] =
    await Promise.all([
      count(supabase, "profiles", { role: "operador" }),
      count(supabase, "profiles", { role: "fondeador" }),
      count(supabase, "invoices"),
      count(supabase, "invoices", { estado: "disponible" }),
      count(supabase, "reveals"),
      count(supabase, "exceptions", { estado: "abierta" }),
    ]);

  const stats = [
    { label: "Operadores registrados", value: operadores },
    { label: "Fondeadores registrados", value: fondeadores },
    { label: "Facturas cargadas", value: facturas },
    { label: "Facturas disponibles", value: disponibles },
    { label: "Facturas reveladas", value: revelos },
  ];

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Resumen</h1>
      <div className="grid sm:grid-cols-3 gap-4 mb-8">
        {stats.map((s) => (
          <Card key={s.label}>
            <p className="text-ink-soft text-xs uppercase tracking-wide mb-1">
              {s.label}
            </p>
            <p className="font-serif text-3xl">{s.value}</p>
          </Card>
        ))}
      </div>

      {pendientes > 0 && (
        <Card className="border-gold bg-gold-soft/30 flex items-center justify-between flex-wrap gap-4">
          <p className="font-medium">
            Hay {pendientes} excepción(es) para revisar
          </p>
          <LinkButton href="/admin/excepciones">Ver excepciones</LinkButton>
        </Card>
      )}
    </div>
  );
}

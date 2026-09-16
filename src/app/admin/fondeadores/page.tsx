import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { formatFecha } from "@/lib/format";
import type { FondeadorCredit, Profile } from "@/lib/database.types";
import { AjusteForm } from "./ajuste-form";

export default async function AdminFondeadoresPage() {
  const supabase = await createClient();
  const { data: fondeadores } = await supabase
    .from("profiles")
    .select("*")
    .eq("role", "fondeador")
    .order("created_at", { ascending: false })
    .returns<Profile[]>();

  const ids = (fondeadores ?? []).map((f) => f.id);
  const { data: creditos } = ids.length
    ? await supabase
        .from("fondeador_credits")
        .select("*")
        .in("fondeador_id", ids)
        .returns<FondeadorCredit[]>()
    : { data: [] as FondeadorCredit[] };
  const balanceDe = (id: string) =>
    creditos?.find((c) => c.fondeador_id === id)?.balance ?? 0;

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Fondeadores</h1>
      {!fondeadores || fondeadores.length === 0 ? (
        <Card>
          <p className="text-ink-soft text-sm">Todavía no hay fondeadores registrados.</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {fondeadores.map((f) => (
            <Card key={f.id} className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <p className="font-semibold">{f.nombre}</p>
                <p className="text-sm text-ink-soft">
                  {f.empresa ? `${f.empresa} · ` : ""}
                  {f.telefono ? `${f.telefono} · ` : ""}
                  desde {formatFecha(f.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-4">
                <span className="font-serif text-2xl">{balanceDe(f.id)}</span>
                <AjusteForm fondeadorId={f.id} />
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

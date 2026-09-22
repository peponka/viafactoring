import { createClient } from "@/lib/supabase/server";
import { Badge, Card } from "@/components/ui";
import { formatMonto } from "@/lib/format";
import type { CreditPack } from "@/lib/database.types";
import { PackForm } from "./pack-form";
import { ToggleButton } from "./toggle-button";

export default async function AdminPacksPage() {
  const supabase = await createClient();
  const { data: packs } = await supabase
    .from("credit_packs")
    .select("*")
    .order("cantidad_creditos", { ascending: true })
    .returns<CreditPack[]>();

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-6">Packs de crédito</h1>
      <Card className="mb-8">
        <PackForm />
      </Card>

      {!packs || packs.length === 0 ? (
        <Card>
          <p className="text-ink-soft text-sm">Todavía no creaste ningún pack.</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {packs.map((pack) => (
            <Card key={pack.id} className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <p className="font-semibold">{pack.nombre}</p>
                  <Badge tone={pack.activo ? "good" : "neutral"}>
                    {pack.activo ? "Activo" : "Inactivo"}
                  </Badge>
                </div>
                <p className="text-sm text-ink-soft">
                  {pack.cantidad_creditos} créditos ·{" "}
                  {formatMonto(pack.precio, pack.moneda)}
                </p>
              </div>
              <ToggleButton packId={pack.id} activo={pack.activo} />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

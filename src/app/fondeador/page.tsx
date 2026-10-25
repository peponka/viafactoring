import { sectorLabel } from "@/lib/format";
import { ActivarPush } from "@/components/activar-push";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getFondeadorPerfil, getUserAndProfile } from "@/lib/session";
import type { Industry, InvoiceTeaser } from "@/lib/database.types";
import { getMisDealRooms } from "@/lib/deal-rooms";
import { TeTocaAVos } from "@/components/deal-room-list";
import { teaserEncaja } from "@/lib/categorias";
import { Feed, type FacturaFeed } from "./feed";

export default async function FondeadorFeedPage() {
  const { user } = await getUserAndProfile();
  if (!user) redirect("/login");
  const perfil = await getFondeadorPerfil(user.id);

  // Sin categoría o sin aprobación todavía: primero la verificación.
  if (!perfil || !perfil.categoria || perfil.verificacion !== "aprobada") {
    redirect("/fondeador/verificacion");
  }
  // Primera vez: elegir preferencias antes de ver el feed.
  if (perfil.monto_min_usd == null) redirect("/fondeador/preferencias");

  const supabase = await createClient();
  const [{ data: teasers }, { data: industrias }, rooms] = await Promise.all([
    supabase
      .from("invoice_teasers")
      .select("*")
      .eq("estado", "disponible")
      .order("created_at", { ascending: false })
      .returns<InvoiceTeaser[]>(),
    supabase.from("industries").select("id, parent_id").returns<Pick<Industry, "id" | "parent_id">[]>(),
    getMisDealRooms("fondeador"),
  ]);

  const padres = new Map((industrias ?? []).map((i) => [i.id, i.parent_id]));
  const todas = (teasers ?? []).filter((t) => !t.ya_revelada);
  const encajan = todas.filter((t) => teaserEncaja(perfil, t, padres));
  const facturas: FacturaFeed[] = encajan
    .filter((t) => !t.ya_pasada)
    .map((t) => ({
      id: t.id,
      industria: sectorLabel(t.industria_nombre, t.rubro),
      deudorTipo: t.deudor_tipo,
      monto: t.monto,
      moneda: t.moneda,
      montoUsd: t.monto_usd,
      plazoDias: t.plazo_dias,
      vencimiento: t.fecha_vencimiento,
      riesgo: t.riesgo,
      descripcion: t.descripcion,
      ofertas: t.ofertas_activas,
      creada: t.created_at,
      verif: t.verificacion ?? { cdc_presente: false },
      datosSector: Object.entries(t.industry_data_publica ?? {}).map(([k, v]) => [k.replaceAll("_", " "), String(v)] as [string, string]),
    }));

  return (
    <div>
      <TeTocaAVos rooms={rooms} />
      <div className="mb-5">
        <ActivarPush />
      </div>
      <Feed
        facturas={facturas}
        pasadas={encajan.filter((t) => t.ya_pasada).length}
        perfil={{
          categoria: perfil.categoria,
          min: perfil.monto_min_usd,
          max: perfil.monto_max_usd,
          plazoMax: perfil.plazo_max_dias,
        }}
      />
    </div>
  );
}

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getFondeadorPerfil, getUserAndProfile } from "@/lib/session";
import type { Industry } from "@/lib/database.types";
import { PreferenciasForm } from "./preferencias-form";

export const metadata = { title: "Preferencias — ViaFactoring" };

export default async function PreferenciasPage() {
  const { user } = await getUserAndProfile();
  if (!user) redirect("/login");
  const perfil = await getFondeadorPerfil(user.id);
  if (!perfil?.categoria) redirect("/fondeador/verificacion");

  const supabase = await createClient();
  const { data: industrias } = await supabase
    .from("industries")
    .select("*")
    .eq("activo", true)
    .order("orden")
    .returns<Industry[]>();

  return (
    <div className="max-w-2xl mx-auto">
      <PreferenciasForm perfil={perfil} industrias={industrias ?? []} />
    </div>
  );
}

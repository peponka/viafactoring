import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getUserAndProfile } from "@/lib/session";
import { TopNav } from "@/components/top-nav";
import { Badge } from "@/components/ui";

export default async function FondeadorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile } = await getUserAndProfile();
  if (!user || !profile) redirect("/login");
  if (profile.role !== "fondeador") redirect("/");

  const supabase = await createClient();
  const { data: credit } = await supabase
    .from("fondeador_credits")
    .select("balance")
    .eq("fondeador_id", profile.id)
    .single();

  return (
    <div className="flex-1 flex flex-col">
      <TopNav
        nombre={profile.nombre}
        links={[
          { href: "/fondeador", label: "Marketplace" },
          { href: "/fondeador/creditos", label: "Créditos" },
        ]}
        rightSlot={
          <Badge tone="gold">{credit?.balance ?? 0} crédito(s)</Badge>
        }
      />
      <main className="wrap max-w-5xl mx-auto px-6 py-10 flex-1 w-full">
        {children}
      </main>
    </div>
  );
}

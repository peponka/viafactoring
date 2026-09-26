import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/session";
import { TopNav } from "@/components/top-nav";
import { Campana } from "@/components/campana";

// NOTA: la compra de créditos (fondeador_credits / /fondeador/creditos) ya
// no es el mecanismo de pago — se reemplazó por el desbloqueo pago por
// operación (ver supabase/migrations/0003_desbloqueo.sql). El código viejo
// de créditos se dejó intacto por si se retoma más adelante, pero se sacó
// de la navegación para no confundir: mostrar un saldo de créditos que ya
// no se usa para nada sería engañoso.
export default async function FondeadorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile } = await getUserAndProfile();
  if (!user || !profile) redirect("/login");
  if (profile.role !== "fondeador") redirect("/");

  return (
    <div className="flex-1 flex flex-col">
      <TopNav
        nombre={profile.nombre}
        rightSlot={<Campana userId={user.id} />}
        links={[
          { href: "/fondeador", label: "Marketplace" },
          { href: "/fondeador/deal-rooms", label: "Mis Deal Rooms" },
        ]}
      />
      <main className="wrap max-w-5xl mx-auto px-6 py-10 flex-1 w-full">
        {children}
      </main>
    </div>
  );
}

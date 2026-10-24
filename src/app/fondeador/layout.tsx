import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/session";
import { TopNav } from "@/components/top-nav";
import { Campana } from "@/components/campana";
import { PedirTelefono } from "@/components/pedir-telefono";

// Los créditos (0001) y el desbloqueo pago (0003) quedaron sin uso: desde la
// 0014 «Me interesa» abre la negociación gratis y se cobra solo la comisión.
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
          { href: "/fondeador", label: "Facturas" },
          { href: "/fondeador/deal-rooms", label: "Negociaciones" },
          { href: "/fondeador/preferencias", label: "Preferencias" },
        ]}
      />
      {!profile.telefono && <PedirTelefono />}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-7 pb-28 md:pt-10 md:pb-14 flex-1 w-full anim-in">
        {children}
      </main>
    </div>
  );
}

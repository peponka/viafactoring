import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/session";
import { TopNav } from "@/components/top-nav";
import { Campana } from "@/components/campana";

// El Deal Room es una ruta compartida por las dos partes. Quién puede ver
// cada Deal Room lo decide la base (get_deal_room_detail + RLS), no esta
// página.
export default async function DealRoomLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile } = await getUserAndProfile();
  if (!user || !profile) redirect("/login");

  const links =
    profile.role === "fondeador"
      ? [
          { href: "/fondeador", label: "Marketplace" },
          { href: "/fondeador/deal-rooms", label: "Mis Deal Rooms" },
        ]
      : profile.role === "operador"
        ? [
            { href: "/operador", label: "Mis facturas" },
            { href: "/operador/deal-rooms", label: "Deal Rooms" },
            { href: "/operador/nueva", label: "Cargar factura" },
          ]
        : [{ href: "/admin", label: "Admin" }];

  return (
    <div className="flex-1 flex flex-col">
      <TopNav
        nombre={profile.nombre}
        links={links}
        rightSlot={profile.role === "admin" ? null : <Campana userId={user.id} />}
      />
      <main className="wrap max-w-6xl mx-auto px-6 py-8 flex-1 w-full">{children}</main>
    </div>
  );
}

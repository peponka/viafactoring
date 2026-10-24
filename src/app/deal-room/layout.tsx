import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/session";
import { TopNav } from "@/components/top-nav";
import { Campana } from "@/components/campana";
import { PedirTelefono } from "@/components/pedir-telefono";

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
          { href: "/fondeador", label: "Facturas" },
          { href: "/fondeador/deal-rooms", label: "Negociaciones" },
          { href: "/fondeador/preferencias", label: "Preferencias" },
        ]
      : profile.role === "operador"
        ? [
            { href: "/operador", label: "Mis facturas" },
            { href: "/operador/nueva", label: "Subir factura" },
            { href: "/operador/deal-rooms", label: "Negociaciones" },
          ]
        : [{ href: "/admin", label: "Admin" }];

  return (
    <div className="flex-1 flex flex-col">
      <TopNav
        nombre={profile.nombre}
        links={links}
        rightSlot={profile.role === "admin" ? null : <Campana userId={user.id} />}
      />
      {profile.role !== "admin" && !profile.telefono && <PedirTelefono />}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 pt-6 pb-28 md:pt-8 md:pb-12 flex-1 w-full">{children}</main>
    </div>
  );
}

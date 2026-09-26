import { redirect } from "next/navigation";
import { getUserAndProfile, homeForRole } from "@/lib/session";
import { TopNav } from "@/components/top-nav";
import { Campana } from "@/components/campana";

export default async function NotificacionesLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getUserAndProfile();
  if (!user || !profile) redirect("/login");
  if (profile.role === "admin") redirect(homeForRole(profile.role));

  const links =
    profile.role === "fondeador"
      ? [
          { href: "/fondeador", label: "Marketplace" },
          { href: "/fondeador/deal-rooms", label: "Mis Deal Rooms" },
        ]
      : [
          { href: "/operador", label: "Mis facturas" },
          { href: "/operador/deal-rooms", label: "Deal Rooms" },
          { href: "/operador/nueva", label: "Cargar factura" },
        ];

  return (
    <div className="flex-1 flex flex-col">
      <TopNav nombre={profile.nombre} links={links} rightSlot={<Campana userId={user.id} />} />
      <main className="wrap max-w-3xl mx-auto px-6 py-10 flex-1 w-full">{children}</main>
    </div>
  );
}

import { redirect } from "next/navigation";
import { getUserAndProfile, homeForRole } from "@/lib/session";
import { TopNav } from "@/components/top-nav";
import { Campana } from "@/components/campana";
import { PedirTelefono } from "@/components/pedir-telefono";

export default async function NotificacionesLayout({ children }: { children: React.ReactNode }) {
  const { user, profile } = await getUserAndProfile();
  if (!user || !profile) redirect("/login");
  if (profile.role === "admin") redirect(homeForRole(profile.role));

  const links =
    profile.role === "fondeador"
      ? [
          { href: "/fondeador", label: "Facturas" },
          { href: "/fondeador/deal-rooms", label: "Negociaciones" },
          { href: "/fondeador/preferencias", label: "Preferencias" },
        ]
      : [
          { href: "/operador", label: "Mis facturas" },
          { href: "/operador/nueva", label: "Subir factura" },
          { href: "/operador/deal-rooms", label: "Negociaciones" },
        ];

  return (
    <div className="flex-1 flex flex-col">
      <TopNav nombre={profile.nombre} links={links} rightSlot={<Campana userId={user.id} />} />
      {!profile.telefono && <PedirTelefono />}
      <main className="max-w-3xl mx-auto px-4 sm:px-6 pt-7 pb-28 md:pt-10 md:pb-14 flex-1 w-full anim-in">{children}</main>
    </div>
  );
}

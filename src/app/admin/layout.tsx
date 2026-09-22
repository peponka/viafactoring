import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/session";
import { TopNav } from "@/components/top-nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile } = await getUserAndProfile();
  if (!user || !profile) redirect("/login");
  if (profile.role !== "admin") redirect("/");

  return (
    <div className="flex-1 flex flex-col">
      <TopNav
        nombre={profile.nombre}
        links={[
          { href: "/admin", label: "Resumen" },
          { href: "/admin/pagos", label: "Pagos" },
          { href: "/admin/operadores", label: "Operadores" },
          { href: "/admin/fondeadores", label: "Fondeadores" },
          { href: "/admin/facturas", label: "Facturas" },
          { href: "/admin/packs", label: "Packs" },
          { href: "/admin/matches", label: "Matches" },
        ]}
      />
      <main className="wrap max-w-6xl mx-auto px-6 py-10 flex-1 w-full">
        {children}
      </main>
    </div>
  );
}

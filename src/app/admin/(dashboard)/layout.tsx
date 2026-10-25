import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/session";
import { TopNav } from "@/components/top-nav";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile } = await getUserAndProfile();
  if (!user || !profile || profile.role !== "admin") redirect("/admin/login");

  return (
    <div className="flex-1 flex flex-col">
      <TopNav
        nombre={profile.nombre}
        logoHref="/admin"
        links={[
          { href: "/admin/fondeadores", label: "Fondeadores" },
          { href: "/admin/operadores", label: "Pymes" },
          { href: "/admin/facturas", label: "Facturas" },
          { href: "/admin/matches", label: "Negociaciones" },
          { href: "/admin/pagos", label: "Pagos" },
          { href: "/admin/excepciones", label: "Excepciones" },
        ]}
      />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 md:py-10 flex-1 w-full">
        {children}
      </main>
    </div>
  );
}

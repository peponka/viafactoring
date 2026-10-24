import { redirect } from "next/navigation";
import { getUserAndProfile } from "@/lib/session";
import { TopNav } from "@/components/top-nav";
import { Campana } from "@/components/campana";
import { PedirTelefono } from "@/components/pedir-telefono";

export default async function OperadorLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { user, profile } = await getUserAndProfile();
  if (!user || !profile) redirect("/login");
  if (profile.role !== "operador") redirect("/");

  return (
    <div className="flex-1 flex flex-col">
      <TopNav
        nombre={profile.nombre}
        rightSlot={<Campana userId={user.id} />}
        links={[
          { href: "/operador", label: "Mis facturas" },
          { href: "/operador/nueva", label: "Subir factura" },
          { href: "/operador/deal-rooms", label: "Negociaciones" },
        ]}
      />
      {!profile.telefono && <PedirTelefono />}
      <main className="max-w-5xl mx-auto px-4 sm:px-6 pt-7 pb-28 md:pt-10 md:pb-14 flex-1 w-full anim-in">
        {children}
      </main>
    </div>
  );
}

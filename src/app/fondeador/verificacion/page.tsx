import Link from "next/link";
import { redirect } from "next/navigation";
import { getFondeadorPerfil, getUserAndProfile } from "@/lib/session";
import { Card } from "@/components/ui";
import { VerificacionForm } from "./verificacion-form";

export const metadata = { title: "Tu cuenta de fondeador — ViaFactoring" };

export default async function VerificacionPage() {
  const { user } = await getUserAndProfile();
  if (!user) redirect("/login");
  const perfil = await getFondeadorPerfil(user.id);

  if (perfil?.verificacion === "en_revision") {
    return (
      <div className="max-w-xl mx-auto">
        <Card className="text-center py-12 px-6 flex flex-col items-center gap-4">
          <span className="w-16 h-16 rounded-2xl bg-gold-soft text-gold flex items-center justify-center">
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 7v5l3 2" />
            </svg>
          </span>
          <h1 className="text-2xl font-bold">Estamos revisando tu documentación</h1>
          <p className="text-ink-soft max-w-[44ch]">
            La revisamos a mano para que las pymes sepan con quién negocian.
            Te avisamos por email y en la campana apenas tu cuenta esté
            aprobada. Mientras tanto, podés dejar listas tus preferencias.
          </p>
          <Link
            href="/fondeador/preferencias"
            className="min-h-11 px-5 rounded-full bg-ink text-white font-semibold flex items-center"
          >
            Definir mis preferencias
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-7">
        <h1 className="text-[1.75rem] md:text-3xl font-bold leading-tight">¿Cómo vas a fondear?</h1>
        <p className="text-ink-soft mt-1.5">
          Tu categoría define qué facturas ves. Después ajustás tu rango exacto.
        </p>
      </div>
      {perfil?.verificacion === "rechazada" && (
        <div className="mb-5 rounded-2xl bg-critical-soft text-critical px-4 py-3 text-sm">
          <p className="font-semibold">Necesitamos que revises tu documentación</p>
          {perfil.verificacion_nota && <p className="mt-0.5">{perfil.verificacion_nota}</p>}
        </div>
      )}
      <VerificacionForm userId={user.id} categoriaActual={perfil?.categoria ?? null} />
    </div>
  );
}

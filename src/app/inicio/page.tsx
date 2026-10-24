import { redirect } from "next/navigation";
import { getUserAndProfile, homeForRole } from "@/lib/session";

// Punto de entrada de la app instalada: lleva directo al panel de cada uno
// (o al login), sin pasar por la landing.
export default async function InicioPage() {
  const { profile } = await getUserAndProfile();
  redirect(profile ? homeForRole(profile.role) : "/login");
}

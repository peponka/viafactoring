"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AYUDA_TELEFONO, normalizarTelefono } from "@/lib/telefono";

// Guarda el teléfono del propio perfil (RLS + grant por columna: solo el
// dueño puede tocar su teléfono).
export async function guardarTelefonoAction(
  _prev: { error: string | null; ok?: boolean },
  formData: FormData,
): Promise<{ error: string | null; ok?: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const telefono = normalizarTelefono(String(formData.get("telefono") || ""));
  if (!telefono) return { error: `Ingresá un teléfono válido (${AYUDA_TELEFONO}).` };

  const { error } = await supabase.from("profiles").update({ telefono }).eq("id", user!.id);
  if (error) return { error: "No se pudo guardar. Probá de nuevo." };

  revalidatePath("/", "layout");
  return { error: null, ok: true };
}

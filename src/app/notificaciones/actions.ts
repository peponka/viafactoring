"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function sesion() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");
  return { supabase, userId: user!.id };
}

// Solo se puede tocar leida_at de los avisos propios (RLS + grant por columna).
export async function abrirAvisoAction(id: string) {
  const { supabase } = await sesion();
  await supabase.from("notifications").update({ leida_at: new Date().toISOString() }).eq("id", id).is("leida_at", null);
  revalidatePath("/", "layout");
}

export async function marcarTodosLeidosAction() {
  const { supabase } = await sesion();
  await supabase.from("notifications").update({ leida_at: new Date().toISOString() }).is("leida_at", null);
  revalidatePath("/", "layout");
}

export async function guardarPreferenciaEmailAction(email: boolean) {
  const { supabase, userId } = await sesion();
  // Solo "email" es editable (grant por columna): update y, si no había
  // preferencias guardadas, insert.
  const { data, error } = await supabase
    .from("notification_prefs")
    .update({ email })
    .eq("user_id", userId)
    .select("user_id");
  if (error) return { error: error.message };
  if (data && data.length > 0) return { error: null };
  const { error: e2 } = await supabase.from("notification_prefs").insert({ user_id: userId, email });
  return { error: e2?.message ?? null };
}

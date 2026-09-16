import "server-only";
import { createClient } from "@/lib/supabase/server";
import type { Profile, Rol } from "@/lib/database.types";

export async function getUserAndProfile() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { user: null, profile: null };

  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single<Profile>();

  return { user, profile };
}

export function homeForRole(role: Rol | null | undefined) {
  if (role === "operador") return "/operador";
  if (role === "fondeador") return "/fondeador";
  if (role === "admin") return "/admin";
  return "/";
}

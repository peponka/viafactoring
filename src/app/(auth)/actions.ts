"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { homeForRole } from "@/lib/session";
import type { Rol } from "@/lib/database.types";

export type AuthState = { error: string | null };

export async function signUpAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const role = String(formData.get("role") || "") as Rol;
  const nombre = String(formData.get("nombre") || "").trim();
  const empresa = String(formData.get("empresa") || "").trim();
  const telefono = String(formData.get("telefono") || "").trim();

  if (!email || !password || !nombre) {
    return { error: "Completá email, contraseña y nombre." };
  }
  if (role !== "operador" && role !== "fondeador") {
    return { error: "Elegí si sos operador (tenés facturas) o fondeador." };
  }
  if (password.length < 8) {
    return { error: "La contraseña tiene que tener al menos 8 caracteres." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { role, nombre, empresa: empresa || null, telefono: telefono || null },
    },
  });

  if (error) {
    return { error: error.message };
  }

  if (!data.session) {
    redirect("/auth/confirmar");
  }

  redirect(homeForRole(role));
}

export async function signInAction(
  _prev: AuthState,
  formData: FormData,
): Promise<AuthState> {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!email || !password) {
    return { error: "Completá email y contraseña." };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return { error: "Email o contraseña incorrectos." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user!.id)
    .single();

  redirect(homeForRole(profile?.role));
}

export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

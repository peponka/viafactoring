"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signInAction, type AuthState } from "../actions";
import { Button, Card, ErrorText, Field, Input } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";

const initialState: AuthState = { error: null };

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(
    signInAction,
    initialState,
  );

  return (
    <main className="wrap max-w-md mx-auto py-20 flex-1 w-full px-6">
      <h1 className="text-3xl font-semibold mb-2">Iniciar sesión</h1>
      <p className="text-ink-soft mb-8">
        Entrá a tu cuenta de ViaFactoring.
      </p>
      <Card>
        <form action={formAction} className="flex flex-col gap-4">
          <Field label="Email">
            <Input type="email" name="email" required autoComplete="email" />
          </Field>
          <Field label="Contraseña">
            <PasswordInput
              name="password"
              required
              autoComplete="current-password"
            />
          </Field>
          <ErrorText>{state.error}</ErrorText>
          <Button type="submit" disabled={pending} className="w-full mt-2">
            {pending ? "Entrando…" : "Entrar"}
          </Button>
        </form>
      </Card>
      <p className="text-sm text-ink-soft mt-6 text-center">
        ¿No tenés cuenta?{" "}
        <Link href="/signup" className="text-accent font-medium">
          Registrate
        </Link>
      </p>
    </main>
  );
}
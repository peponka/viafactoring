"use client";

import { useActionState } from "react";
import { adminSignInAction, type AdminAuthState } from "./actions";
import { Button, Card, ErrorText, Field, Input } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";

const initialState: AdminAuthState = { error: null };

export default function AdminLoginPage() {
  const [state, formAction, pending] = useActionState(
    adminSignInAction,
    initialState,
  );

  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <Card className="w-full max-w-sm">
        <form action={formAction} className="flex flex-col gap-4">
          <Field label="Email">
            <Input
              type="email"
              name="email"
              required
              autoComplete="email"
              autoFocus
            />
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
    </main>
  );
}

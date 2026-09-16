"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signUpAction, type AuthState } from "../actions";
import { Button, Card, ErrorText, Field, Input } from "@/components/ui";

const initialState: AuthState = { error: null };

export default function SignupPage() {
  const [state, formAction, pending] = useActionState(
    signUpAction,
    initialState,
  );
  const [role, setRole] = useState<"operador" | "fondeador">("operador");

  return (
    <main className="wrap max-w-md mx-auto py-20 flex-1 w-full px-6">
      <h1 className="text-3xl font-semibold mb-2">Crear cuenta</h1>
      <p className="text-ink-soft mb-8">
        Sumate como operador de flete o como fondeador.
      </p>
      <Card>
        <form action={formAction} className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-2 p-1 bg-surface-2 rounded-lg">
            {(["operador", "fondeador"] as const).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`py-2.5 rounded-md text-sm font-semibold transition ${
                  role === r
                    ? "bg-accent text-accent-ink"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                {r === "operador" ? "Operador de flete" : "Fondeador"}
              </button>
            ))}
          </div>
          <input type="hidden" name="role" value={role} />

          <Field label="Nombre">
            <Input type="text" name="nombre" required autoComplete="name" />
          </Field>
          <Field
            label={
              role === "operador"
                ? "Empresa / operador (opcional)"
                : "Empresa / financiera (opcional)"
            }
          >
            <Input type="text" name="empresa" />
          </Field>
          <Field label="Teléfono (opcional)">
            <Input type="tel" name="telefono" />
          </Field>
          <Field label="Email">
            <Input type="email" name="email" required autoComplete="email" />
          </Field>
          <Field label="Contraseña">
            <Input
              type="password"
              name="password"
              required
              minLength={8}
              autoComplete="new-password"
            />
          </Field>
          <ErrorText>{state.error}</ErrorText>
          <Button type="submit" disabled={pending} className="w-full mt-2">
            {pending ? "Creando cuenta…" : "Crear cuenta"}
          </Button>
        </form>
      </Card>
      <p className="text-sm text-ink-soft mt-6 text-center">
        ¿Ya tenés cuenta?{" "}
        <Link href="/login" className="text-accent font-medium">
          Iniciá sesión
        </Link>
      </p>
    </main>
  );
}

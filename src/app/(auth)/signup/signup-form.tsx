"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { signUpAction, type AuthState } from "../actions";
import { Button, Card, ErrorText, Field, Input } from "@/components/ui";
import { PasswordInput } from "@/components/password-input";

const initialState: AuthState = { error: null };

export function SignupForm({
  rolInicial,
  origen,
}: {
  rolInicial: "operador" | "fondeador";
  origen: string;
}) {
  const [state, formAction, pending] = useActionState(
    signUpAction,
    initialState,
  );
  const [role, setRole] = useState<"operador" | "fondeador">(rolInicial);
  const deLicitia = origen === "licitia" && role === "operador";

  return (
    <main className="max-w-md mx-auto pt-10 pb-16 md:pt-16 flex-1 w-full px-4 sm:px-6">
      <h1 className="text-3xl font-bold mb-2">Crear cuenta</h1>
      <p className="text-ink-soft mb-8">
        Gratis para pymes. Los fondeadores pagan solo si cierran.
      </p>
      {deLicitia && (
        <div className="mb-6 rounded-2xl border border-accent/30 bg-accent-soft p-4 text-sm text-ink">
          <p className="font-semibold">¿Ganaste una licitación?</p>
          <p className="mt-1 text-ink-soft">
            Creá tu cuenta gratis y publicá la factura que le emitiste a la entidad. Fondeadores te
            hacen ofertas para adelantarte el cobro, sin esperar a que pague el Estado.
          </p>
        </div>
      )}
      <Card>
        <form action={formAction} className="flex flex-col gap-4">
          <div role="radiogroup" aria-label="Tipo de cuenta" className="grid grid-cols-2 gap-2.5">
            {(["operador", "fondeador"] as const).map((r) => (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={role === r}
                onClick={() => setRole(r)}
                className={`text-left p-3.5 rounded-2xl border-2 transition flex flex-col gap-1 ${
                  role === r
                    ? "border-accent bg-accent-soft"
                    : "border-line bg-surface hover:border-line-strong"
                }`}
              >
                <span className={`text-sm font-bold ${role === r ? "text-accent" : "text-ink"}`}>
                  {r === "operador" ? "Tengo facturas" : "Tengo capital"}
                </span>
                <span className="text-xs text-ink-soft leading-snug">
                  {r === "operador" ? "Pyme o empresa que quiere cobrar antes" : "Inversor, empresa, cooperativa, financiera, banco o fondo"}
                </span>
              </button>
            ))}
          </div>
          <input type="hidden" name="role" value={role} />
          <input type="hidden" name="origen" value={origen} />

          <Field label="Nombre">
            <Input type="text" name="nombre" required autoComplete="name" />
          </Field>
          <Field
            label={
              role === "operador"
                ? "Empresa (opcional)"
                : "Empresa / financiera (opcional)"
            }
          >
            <Input type="text" name="empresa" />
          </Field>
          <Field label="Teléfono">
            <Input
              type="tel"
              name="telefono"
              required
              autoComplete="tel"
              placeholder="0981 123 456"
            />
          </Field>
          <p className="text-xs text-ink-soft -mt-2">
            Solo se comparte con la otra parte cuando cierran un acuerdo.
          </p>
          <Field label="Email">
            <Input type="email" name="email" required autoComplete="email" />
          </Field>
          <Field label="Contraseña">
            <PasswordInput
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


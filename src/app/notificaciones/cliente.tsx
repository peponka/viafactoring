"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { abrirAvisoAction, guardarPreferenciaEmailAction, marcarTodosLeidosAction } from "./actions";

export function AbrirAviso({
  id,
  url,
  leido,
  children,
}: {
  id: string;
  url: string;
  leido: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          if (!leido) await abrirAvisoAction(id);
          router.push(url);
        })
      }
      className={`w-full text-left rounded-xl border px-4 py-3 transition hover:border-accent ${
        leido ? "border-line bg-surface" : "border-accent/40 bg-accent-soft"
      }`}
    >
      {children}
    </button>
  );
}

export function MarcarTodos() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      className="text-sm underline text-ink-soft hover:text-ink"
      onClick={() =>
        startTransition(async () => {
          await marcarTodosLeidosAction();
          router.refresh();
        })
      }
    >
      Marcar todos como leídos
    </button>
  );
}

export function PreferenciaEmail({ inicial }: { inicial: boolean }) {
  const [email, setEmail] = useState(inicial);
  const [pending, startTransition] = useTransition();
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={email}
        disabled={pending}
        onChange={(e) => {
          const v = e.target.checked;
          setEmail(v);
          startTransition(async () => {
            const r = await guardarPreferenciaEmailAction(v);
            if (r.error) setEmail(!v);
          });
        }}
      />
      Recibir avisos por email
    </label>
  );
}

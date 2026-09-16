"use client";

import { useActionState } from "react";
import { solicitarPackAction } from "../actions";
import { Button, ErrorText } from "@/components/ui";
import type { CreditPack } from "@/lib/database.types";

const initial = { error: null as string | null, ok: false };

export function SolicitarPackForm({ pack }: { pack: CreditPack }) {
  const [state, formAction, pending] = useActionState(
    solicitarPackAction,
    initial,
  );

  if (state.ok) {
    return (
      <p className="text-sm text-good font-medium">
        Solicitud enviada — te vamos a mandar el link de pago.
      </p>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-2">
      <input type="hidden" name="pack_id" value={pack.id} />
      <Button type="submit" variant="ghost" disabled={pending}>
        {pending ? "Solicitando…" : "Quiero este pack"}
      </Button>
      <ErrorText>{state.error}</ErrorText>
    </form>
  );
}

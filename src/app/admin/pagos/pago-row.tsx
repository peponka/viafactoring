"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  cancelarPagoAction,
  confirmarPagoAction,
  guardarLinkPagoAction,
} from "../actions";
import { Button, ErrorText, Input } from "@/components/ui";
import type { PaymentRequest } from "@/lib/database.types";

export function PagoRow({ pago }: { pago: PaymentRequest }) {
  const [link, setLink] = useState(pago.payment_link ?? "");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (pago.estado !== "pendiente") return null;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2 flex-wrap">
        <Input
          placeholder="Pegá el link de pago externo (opcional)"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          className="max-w-xs"
        />
        <Button
          variant="ghost"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await guardarLinkPagoAction(pago.id, link);
              router.refresh();
            })
          }
        >
          Guardar link
        </Button>
      </div>
      <div className="flex items-center gap-2">
        <Button
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await confirmarPagoAction(pago.id, link || undefined);
              if (res.error) setError(res.error);
              else router.refresh();
            })
          }
        >
          {pending ? "Confirmando…" : "Confirmar pago y acreditar"}
        </Button>
        <Button
          variant="danger"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await cancelarPagoAction(pago.id);
              router.refresh();
            })
          }
        >
          Cancelar
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

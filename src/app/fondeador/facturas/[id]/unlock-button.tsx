"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { solicitarDesbloqueoAction } from "../../actions";
import { Button, ErrorText } from "@/components/ui";
import { formatMonto } from "@/lib/format";
import type { PaymentRequest } from "@/lib/database.types";

export function UnlockButton({
  invoiceId,
  fee,
  moneda,
  pendingRequest,
}: {
  invoiceId: string;
  fee: number;
  moneda: string;
  pendingRequest: PaymentRequest | null;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (pendingRequest && pendingRequest.estado === "pendiente") {
    return (
      <div className="rounded-lg border border-line bg-surface-soft p-4 text-sm">
        <p className="font-medium mb-1">
          Solicitud de desbloqueo enviada — {formatMonto(pendingRequest.monto, pendingRequest.moneda)}
        </p>
        <p className="text-ink-soft">
          Transferí ese monto y esperá la confirmación del admin. En cuanto
          se confirme el pago, se habilita el expediente completo acá mismo.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 items-start">
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await solicitarDesbloqueoAction(invoiceId);
            if (result.error) {
              setError(result.error);
            } else {
              router.refresh();
            }
          })
        }
      >
        {pending
          ? "Enviando…"
          : `Me interesa esta operación — desbloquear por ${formatMonto(fee, moneda)}`}
      </Button>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

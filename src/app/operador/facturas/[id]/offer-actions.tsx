"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { responderOfertaAction } from "../../actions";
import { Button, ErrorText } from "@/components/ui";

export function OfferActions({
  offerId,
  invoiceId,
}: {
  offerId: string;
  invoiceId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function responder(aceptar: boolean) {
    startTransition(async () => {
      const res = await responderOfertaAction(offerId, invoiceId, aceptar);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Button disabled={pending} onClick={() => responder(true)}>
          {pending ? "Procesando…" : "Aceptar oferta"}
        </Button>
        <Button variant="danger" disabled={pending} onClick={() => responder(false)}>
          Rechazar
        </Button>
      </div>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

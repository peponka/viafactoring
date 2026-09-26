"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { retirarFacturaAction } from "../../actions";
import { Button } from "@/components/ui";

export function RetirarButton({ invoiceId }: { invoiceId: string }) {
  const [pending, startTransition] = useTransition();
  const [confirmando, setConfirmando] = useState(false);
  const router = useRouter();

  if (!confirmando) {
    return (
      <Button variant="ghost" className="w-fit" onClick={() => setConfirmando(true)}>
        Retirar factura del marketplace
      </Button>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm">
        Al retirarla se cierran los Deal Rooms en curso de esta factura y se avisa a los fondeadores.
      </p>
      <div className="flex gap-2">
        <Button
          variant="danger"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await retirarFacturaAction(invoiceId);
              router.refresh();
            })
          }
        >
          {pending ? "Retirando…" : "Sí, retirarla"}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={() => setConfirmando(false)}>
          Volver
        </Button>
      </div>
    </div>
  );
}

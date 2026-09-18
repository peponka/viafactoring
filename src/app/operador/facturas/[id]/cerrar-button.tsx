"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { cerrarFacturaAction } from "../../actions";
import { Button } from "@/components/ui";

export function CerrarButton({ invoiceId }: { invoiceId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await cerrarFacturaAction(invoiceId);
          router.refresh();
        })
      }
    >
      {pending ? "Cerrando…" : "Marcar como cerrada (trato arreglado)"}
    </Button>
  );
}

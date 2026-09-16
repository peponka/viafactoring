"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { retirarFacturaAction } from "../../actions";
import { Button } from "@/components/ui";

export function RetirarButton({ invoiceId }: { invoiceId: string }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
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
      {pending ? "Retirando…" : "Retirar factura del marketplace"}
    </Button>
  );
}

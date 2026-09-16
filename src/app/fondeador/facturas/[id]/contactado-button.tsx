"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { marcarContactadoAction } from "../../actions";
import { Button } from "@/components/ui";

export function ContactadoButton({
  invoiceId,
  yaContactado,
}: {
  invoiceId: string;
  yaContactado: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (yaContactado) {
    return <span className="text-sm text-good font-medium">✓ Marcado como contactado</span>;
  }

  return (
    <Button
      variant="ghost"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await marcarContactadoAction(invoiceId);
          router.refresh();
        })
      }
    >
      {pending ? "Guardando…" : "Marcar como contactado"}
    </Button>
  );
}

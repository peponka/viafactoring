"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { revelarFacturaAction } from "../../actions";
import { Button, ErrorText } from "@/components/ui";

export function RevealButton({ invoiceId }: { invoiceId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex flex-col gap-2 items-start">
      <Button
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await revelarFacturaAction(invoiceId);
            if (result.error) {
              setError(result.error);
            } else {
              router.refresh();
            }
          })
        }
      >
        {pending ? "Destrabando…" : "Destrabar detalle (1 crédito)"}
      </Button>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

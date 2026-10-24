"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { marcarInteresAction } from "../../actions";
import { Button, ErrorText } from "@/components/ui";

// «Me interesa» abre el Deal Room al instante, sin costo. ViaFactoring cobra
// solo la comisión de cierre si la PyME acepta una oferta.
export function InteresButton({ invoiceId }: { invoiceId: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function interesar() {
    setError(null);
    startTransition(async () => {
      const r = await marcarInteresAction(invoiceId);
      if (r.error || !r.dealRoomId) return setError(r.error ?? "No pudimos abrir la negociación.");
      router.push(`/deal-room/${r.dealRoomId}`);
    });
  }

  return (
    <div className="flex flex-col gap-2 items-stretch sm:items-start">
      <Button onClick={interesar} disabled={pending} className="!min-h-13 text-base px-7">
        {pending ? "Abriendo la negociación…" : "Me interesa"}
      </Button>
      <p className="text-xs text-ink-soft">
        Sin costo. Ves el deudor, la ficha de verificación y los documentos. Solo pagás una comisión fija si la pyme acepta tu oferta.
      </p>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

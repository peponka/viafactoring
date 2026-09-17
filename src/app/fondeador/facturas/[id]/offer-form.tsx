"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { hacerOfertaAction } from "../../actions";
import { Button, ErrorText, Field, Input, Textarea } from "@/components/ui";
import type { Offer } from "@/lib/database.types";

const initial = { error: null as string | null, ok: false };

export function OfferForm({
  invoiceId,
  montoFactura,
  ofertaExistente,
}: {
  invoiceId: string;
  montoFactura: number;
  ofertaExistente: Offer | null;
}) {
  const [state, formAction, pending] = useActionState(hacerOfertaAction, initial);
  const router = useRouter();

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state.ok, router]);

  const puedeEditar = !ofertaExistente || ofertaExistente.estado !== "aceptada";
  if (!puedeEditar) return null;

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <input type="hidden" name="invoice_id" value={invoiceId} />
      <Field label="Monto de anticipo que ofrecés">
        <Input
          type="number"
          name="monto_ofrecido"
          step="0.01"
          min={0}
          max={montoFactura}
          required
          defaultValue={ofertaExistente?.monto_ofrecido ?? ""}
          placeholder={`Hasta ${montoFactura}`}
        />
      </Field>
      <Field label="Mensaje para el operador (opcional)">
        <Textarea
          name="mensaje"
          rows={2}
          defaultValue={ofertaExistente?.mensaje ?? ""}
        />
      </Field>
      <ErrorText>{state.error}</ErrorText>
      <Button type="submit" disabled={pending} className="w-fit">
        {pending
          ? "Enviando…"
          : ofertaExistente
            ? "Actualizar oferta"
            : "Hacer oferta"}
      </Button>
    </form>
  );
}

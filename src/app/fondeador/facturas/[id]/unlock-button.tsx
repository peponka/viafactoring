"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { desbloquearAction } from "../../actions";
import { Button, ErrorText } from "@/components/ui";
import { formatMonto } from "@/lib/format";

type EstadoPago = {
  id: string;
  estado: string;
  monto_cobro: number | null;
  moneda_cobro: string | null;
  monto_usd: number | null;
} | null;

// Desbloquear = pagar en la pasarela. Al volver, la página espera la
// confirmación de la pasarela (webhook) y entra sola al Deal Room.
export function UnlockButton({
  invoiceId,
  feeUsd,
  pago,
  volviendo,
}: {
  invoiceId: string;
  feeUsd: number;
  pago: EstadoPago;
  volviendo: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const esperando = pago?.estado === "procesando" || (volviendo && pago?.estado === "pendiente");
  const fallo = pago && ["fallido", "rechazado"].includes(pago.estado);

  useEffect(() => {
    if (!esperando) return;
    const t = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(t);
  }, [esperando, router]);

  function pagar() {
    setError(null);
    startTransition(async () => {
      const r = await desbloquearAction(invoiceId);
      if (!r.ok) return setError(r.error);
      if ("url" in r && r.url) window.location.href = r.url;
      else router.refresh();
    });
  }

  if (esperando) {
    return (
      <div className="rounded-xl border border-line bg-surface-2 p-4 text-sm" role="status">
        <p className="font-medium">⏳ Estamos esperando la confirmación del pago.</p>
        <p className="text-ink-soft mt-1">
          En cuanto la pasarela lo confirme, se abre el Deal Room. No hace falta que hagas nada.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 items-start">
      {fallo && (
        <p className="text-sm text-critical bg-critical-soft rounded-lg px-3.5 py-2.5">
          El pago no pudo completarse. Podés intentarlo de nuevo.
        </p>
      )}
      <Button disabled={pending} onClick={pagar}>
        {pending ? "Abriendo el pago…" : `Desbloquear y negociar — ${formatMonto(feeUsd, "USD")}`}
      </Button>
      <p className="text-xs text-ink-soft">
        Se paga en guaraníes al tipo de cambio del día. Si no se concreta ningún acuerdo, no pagás nada más.
      </p>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

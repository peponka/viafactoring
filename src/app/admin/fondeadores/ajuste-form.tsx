"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ajustarCreditoAction } from "../actions";
import { Button, ErrorText, Input } from "@/components/ui";

export function AjusteForm({ fondeadorId }: { fondeadorId: string }) {
  const [cantidad, setCantidad] = useState("");
  const [nota, setNota] = useState("");
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <Input
        type="number"
        placeholder="± créditos"
        value={cantidad}
        onChange={(e) => setCantidad(e.target.value)}
        className="w-28"
      />
      <Input
        type="text"
        placeholder="Nota (opcional)"
        value={nota}
        onChange={(e) => setNota(e.target.value)}
        className="w-40"
      />
      <Button
        variant="ghost"
        disabled={pending || !cantidad}
        onClick={() =>
          startTransition(async () => {
            const res = await ajustarCreditoAction(
              fondeadorId,
              Number(cantidad),
              nota,
            );
            if (res.error) setError(res.error);
            else {
              setCantidad("");
              setNota("");
              router.refresh();
            }
          })
        }
      >
        Ajustar
      </Button>
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

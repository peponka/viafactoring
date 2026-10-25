"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { retirarFacturaAction, type MotivoRetiro } from "../../actions";
import { Button, ErrorText, Select } from "@/components/ui";

const MOTIVOS: { value: MotivoRetiro; label: string }[] = [
  { value: "cerro_con_fondeador", label: "La descontó un fondeador que conocí en ViaFactoring" },
  { value: "otra_via", label: "La descontó un banco o financiera por otro lado" },
  { value: "cobro_el_deudor", label: "El deudor ya me pagó" },
  { value: "ya_no_necesito", label: "Ya no necesito adelantarla" },
  { value: "otro", label: "Otro motivo" },
];

export function RetirarButton({
  invoiceId,
  negociaciones,
}: {
  invoiceId: string;
  negociaciones: { id: string; label: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState<MotivoRetiro | "">("");
  const [room, setRoom] = useState(negociaciones.length === 1 ? negociaciones[0].id : "");
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  if (!abierto) {
    return (
      <Button variant="ghost" className="w-fit" onClick={() => setAbierto(true)}>
        Retirar factura
      </Button>
    );
  }

  const pideFondeador = motivo === "cerro_con_fondeador" && negociaciones.length > 0;
  const listo = motivo !== "" && (!pideFondeador || room !== "");

  return (
    <div className="bg-surface border border-line rounded-3xl p-5 flex flex-col gap-4 max-w-xl">
      <div>
        <p className="font-semibold">¿Por qué la retirás?</p>
        <p className="text-sm text-ink-soft">
          Nos ayuda a mejorar. Al retirarla se cierran sus negociaciones y avisamos a los fondeadores.
        </p>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="sr-only">Motivo</legend>
        {MOTIVOS.map((m) => (
          <label
            key={m.value}
            className="flex items-start gap-3 rounded-2xl border border-line px-3.5 py-3 cursor-pointer text-sm has-[:checked]:border-accent has-[:checked]:bg-accent-soft"
          >
            <input
              type="radio"
              name="motivo"
              value={m.value}
              checked={motivo === m.value}
              onChange={() => setMotivo(m.value)}
              className="mt-0.5 accent-[var(--accent)]"
            />
            <span>{m.label}</span>
          </label>
        ))}
      </fieldset>

      {pideFondeador && negociaciones.length > 1 && (
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">¿Con cuál de las negociaciones?</span>
          <Select value={room} onChange={(e) => setRoom(e.target.value)}>
            <option value="">Elegí una</option>
            {negociaciones.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </Select>
        </label>
      )}

      {pideFondeador && (
        <p className="text-sm text-ink-soft">
          A vos no te cuesta nada: la comisión de ViaFactoring la paga el fondeador.
        </p>
      )}

      <ErrorText>{error}</ErrorText>

      <div className="flex gap-2 flex-wrap">
        <Button
          variant="danger"
          disabled={pending || !listo}
          onClick={() =>
            startTransition(async () => {
              setError(null);
              const r = await retirarFacturaAction(invoiceId, motivo as MotivoRetiro, pideFondeador ? room : null);
              if (r.error) {
                setError(r.error);
                return;
              }
              router.refresh();
            })
          }
        >
          {pending ? "Retirando…" : "Retirar factura"}
        </Button>
        <Button variant="ghost" disabled={pending} onClick={() => setAbierto(false)}>
          Volver
        </Button>
      </div>
    </div>
  );
}

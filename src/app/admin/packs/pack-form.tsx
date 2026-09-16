"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { crearPackAction } from "../actions";
import { Button, Field, Input, Select } from "@/components/ui";

export function PackForm() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      action={(formData) =>
        startTransition(async () => {
          await crearPackAction(formData);
          formRef.current?.reset();
          router.refresh();
        })
      }
      className="grid sm:grid-cols-4 gap-3 items-end"
    >
      <Field label="Nombre">
        <Input type="text" name="nombre" required placeholder="Pack 10 créditos" />
      </Field>
      <Field label="Créditos">
        <Input type="number" name="cantidad_creditos" min="1" required />
      </Field>
      <Field label="Precio">
        <Input type="number" name="precio" min="0" step="0.01" required />
      </Field>
      <Field label="Moneda">
        <Select name="moneda" defaultValue="USD">
          <option value="USD">USD</option>
          <option value="PYG">PYG</option>
          <option value="ARS">ARS</option>
        </Select>
      </Field>
      <Button type="submit" disabled={pending} className="sm:col-span-4">
        {pending ? "Creando…" : "Crear pack"}
      </Button>
    </form>
  );
}

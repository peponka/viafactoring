"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { togglePackAction } from "../../actions";
import { Button } from "@/components/ui";

export function ToggleButton({
  packId,
  activo,
}: {
  packId: string;
  activo: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <Button
      variant="ghost"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          await togglePackAction(packId, !activo);
          router.refresh();
        })
      }
    >
      {activo ? "Desactivar" : "Activar"}
    </Button>
  );
}

"use client";

import { useState, useTransition } from "react";
import { getDocumentoUrlAction } from "../../actions";
import { Button } from "@/components/ui";

export function DocumentoLink({ invoiceId }: { invoiceId: string }) {
  const [pending, startTransition] = useTransition();
  const [url, setUrl] = useState<string | null>(null);

  if (url) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-accent font-medium text-sm underline"
      >
        Abrir documento (link válido por 10 min) ↗
      </a>
    );
  }

  return (
    <Button
      variant="ghost"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const { url } = await getDocumentoUrlAction(invoiceId);
          setUrl(url);
        })
      }
    >
      {pending ? "Generando link…" : "Ver documento de la factura"}
    </Button>
  );
}

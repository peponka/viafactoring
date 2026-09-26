import { formatFecha, formatMonto } from "@/lib/format";
import type { DealRoomDetail, DocumentRow } from "@/lib/database.types";

// El costado: la factura, con quién negociás, los documentos y, recién
// cuando corresponde, el contacto. Nada de estados técnicos.
function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line last:border-0 pb-4 last:pb-0">
      <p className="text-xs uppercase tracking-wide text-ink-soft font-semibold mb-2">{titulo}</p>
      {children}
    </section>
  );
}

function Dato({ k, v }: { k: string; v: React.ReactNode }) {
  if (v === null || v === undefined || v === "") return null;
  return (
    <p className="text-sm">
      <span className="text-ink-soft">{k}: </span>
      {v}
    </p>
  );
}

export function Costado({ d, documentos }: { d: DealRoomDetail; documentos: DocumentRow[] }) {
  const inv = d.invoice;
  const contacto = d.nivel >= 4 || d.rol === "admin";
  const datosSector = Object.entries(inv.industry_data ?? {});

  const contenido = (
    <div className="flex flex-col gap-4">
      <Bloque titulo="Factura">
        <Dato k="Monto" v={<span className="num">{formatMonto(inv.monto, inv.moneda)}</span>} />
        <Dato k="Deudor" v={inv.deudor_nombre} />
        <Dato k="Vencimiento" v={inv.fecha_vencimiento ? formatFecha(inv.fecha_vencimiento) : `${inv.plazo_dias} días`} />
        <Dato k="Sector" v={d.industria ?? inv.rubro} />
        {datosSector.map(([k, v]) => (
          <Dato key={k} k={k.replaceAll("_", " ")} v={String(v)} />
        ))}
        {inv.descripcion && <p className="text-sm text-ink-soft mt-1">{inv.descripcion}</p>}
      </Bloque>

      <Bloque titulo="Con quién negociás">
        <p className="text-sm font-medium">{d.contraparte.empresa || d.contraparte.nombre || "—"}</p>
        {d.contraparte.empresa && d.contraparte.nombre && (
          <p className="text-sm text-ink-soft">{d.contraparte.nombre}</p>
        )}
      </Bloque>

      <Bloque titulo="Documentos">
        {documentos.length === 0 ? (
          <p className="text-sm text-ink-soft">Todavía no hay documentos.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {documentos.map((doc) => (
              <li key={doc.id}>
                <a
                  href={`/api/documentos/${doc.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-accent underline break-all"
                >
                  📄 {doc.nombre}
                </a>
              </li>
            ))}
          </ul>
        )}
      </Bloque>

      <Bloque titulo="Contacto">
        {contacto ? (
          <div className="flex flex-col gap-0.5">
            <Dato k="Teléfono" v={d.contraparte.telefono} />
            <Dato k="Email" v={d.contraparte.email} />
            {d.rol !== "operador" && <Dato k="Contacto de la operación" v={inv.operador_contacto} />}
            {d.rol !== "operador" && <Dato k="Contacto del deudor" v={inv.deudor_contacto} />}
          </div>
        ) : (
          <p className="text-sm text-ink-soft">Se muestra cuando se paga la comisión del cierre.</p>
        )}
      </Bloque>
    </div>
  );

  return (
    <>
      <details className="lg:hidden rounded-2xl border border-line bg-surface p-4 order-first">
        <summary className="text-sm font-semibold cursor-pointer">Datos de la operación</summary>
        <div className="mt-4">{contenido}</div>
      </details>
      <aside className="hidden lg:block rounded-2xl border border-line bg-surface p-5 sticky top-4">{contenido}</aside>
    </>
  );
}

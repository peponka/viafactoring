import { createClient, createServiceRoleClient } from "@/lib/supabase/server";
import { Badge, Card, PageHeader } from "@/components/ui";
import { formatFecha } from "@/lib/format";
import { CATEGORIA_LABEL, rangoTexto } from "@/lib/categorias";
import type { EstadoVerificacion, FondeadorPerfil, Profile } from "@/lib/database.types";
import { VerificarForm } from "./verificar-form";

const ESTADO: Record<EstadoVerificacion, { label: string; tone: "neutral" | "good" | "warn" | "critical" }> = {
  incompleta: { label: "Sin documentación", tone: "neutral" },
  en_revision: { label: "En revisión", tone: "warn" },
  aprobada: { label: "Aprobado", tone: "good" },
  rechazada: { label: "Cambios pedidos", tone: "critical" },
};

async function linksFirmados(rutas: string[]) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY || rutas.length === 0) return [];
  const admin = createServiceRoleClient();
  const { data } = await admin.storage.from("verificaciones").createSignedUrls(rutas, 60 * 15);
  return (data ?? [])
    .map((d, i) => ({ url: d.signedUrl, nombre: rutas[i].split("/").pop()?.replace(/^\d+-/, "") ?? "documento" }))
    .filter((d): d is { url: string; nombre: string } => !!d.url);
}

export default async function AdminFondeadoresPage() {
  const supabase = await createClient();
  const [{ data: fondeadores }, { data: perfiles }] = await Promise.all([
    supabase.from("profiles").select("*").eq("role", "fondeador").order("created_at", { ascending: false }).returns<Profile[]>(),
    supabase.from("fondeador_perfiles").select("*").returns<FondeadorPerfil[]>(),
  ]);
  const perfilDe = (id: string) => perfiles?.find((p) => p.fondeador_id === id) ?? null;
  const pendientes = (fondeadores ?? []).filter((f) => perfilDe(f.id)?.verificacion === "en_revision");
  const docs = await Promise.all(pendientes.map((f) => linksFirmados(perfilDe(f.id)?.documentos ?? [])));

  return (
    <div>
      <PageHeader title="Fondeadores" subtitle={`${pendientes.length} pendiente${pendientes.length === 1 ? "" : "s"} de verificación`} />

      {pendientes.length > 0 && (
        <section className="mb-10 flex flex-col gap-3">
          <h2 className="text-lg font-bold">Para verificar</h2>
          {pendientes.map((f, i) => {
            const p = perfilDe(f.id)!;
            return (
              <Card key={f.id} className="flex flex-col gap-4 border-warn">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <p className="font-bold text-lg">{f.empresa || f.nombre}</p>
                    <p className="text-sm text-ink-soft">
                      {f.nombre}
                      {f.email ? ` · ${f.email}` : ""}
                      {f.telefono ? ` · ${f.telefono}` : ""} · desde {formatFecha(f.created_at)}
                    </p>
                  </div>
                  <Badge tone="warn">{p.categoria ? CATEGORIA_LABEL[p.categoria] : "Sin categoría"}</Badge>
                </div>
                <div className="flex flex-wrap gap-2">
                  {docs[i].length === 0 ? (
                    <p className="text-sm text-ink-soft">
                      {process.env.SUPABASE_SERVICE_ROLE_KEY ? "Sin documentos." : "Falta SUPABASE_SERVICE_ROLE_KEY para ver los documentos."}
                    </p>
                  ) : (
                    docs[i].map((d) => (
                      <a key={d.url} href={d.url} target="_blank" rel="noreferrer" className="min-h-10 px-3.5 rounded-full border border-line-strong bg-surface text-sm font-semibold flex items-center gap-2 hover:border-accent">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
                          <path d="M14 3v6h6" />
                        </svg>
                        {d.nombre}
                      </a>
                    ))
                  )}
                </div>
                <VerificarForm fondeadorId={f.id} />
              </Card>
            );
          })}
        </section>
      )}

      <h2 className="text-lg font-bold mb-3">Todos</h2>
      {!fondeadores || fondeadores.length === 0 ? (
        <Card>
          <p className="text-ink-soft text-sm">Todavía no hay fondeadores registrados.</p>
        </Card>
      ) : (
        <div className="grid gap-3">
          {fondeadores.map((f) => {
            const p = perfilDe(f.id);
            const estado = ESTADO[p?.verificacion ?? "incompleta"];
            return (
              <Card key={f.id} className="!p-5 flex items-center justify-between gap-4 flex-wrap">
                <div>
                  <p className="font-semibold">{f.empresa || f.nombre}</p>
                  <p className="text-sm text-ink-soft">
                    {p?.categoria ? `${CATEGORIA_LABEL[p.categoria]} · ${rangoTexto(p.monto_min_usd, p.monto_max_usd)}` : "Sin categoría"}
                    {f.email ? ` · ${f.email}` : ""}
                  </p>
                </div>
                <Badge tone={estado.tone}>{estado.label}</Badge>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

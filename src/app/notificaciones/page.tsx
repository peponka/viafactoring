import { createClient } from "@/lib/supabase/server";
import { Card } from "@/components/ui";
import { formatFechaHora } from "@/lib/format";
import type { Notification, NotificationPrefs } from "@/lib/database.types";
import { AbrirAviso, MarcarTodos, PreferenciaEmail } from "./cliente";

export default async function NotificacionesPage() {
  const supabase = await createClient();
  const [{ data: avisos }, { data: prefs }] = await Promise.all([
    supabase
      .from("notifications")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(100)
      .returns<Notification[]>(),
    supabase.from("notification_prefs").select("*").maybeSingle<NotificationPrefs>(),
  ]);
  const lista = avisos ?? [];
  const sinLeer = lista.filter((a) => !a.leida_at).length;

  return (
    <div>
      <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
        <h1 className="text-2xl font-semibold">Avisos</h1>
        {sinLeer > 0 && <MarcarTodos />}
      </div>

      {lista.length === 0 ? (
        <Card>
          <p className="text-sm text-ink-soft">No tenés avisos todavía.</p>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {lista.map((a) => (
            <li key={a.id}>
              <AbrirAviso id={a.id} url={a.url} leido={!!a.leida_at}>
                <span className="flex items-start justify-between gap-3">
                  <span>
                    <span className={`block ${a.leida_at ? "" : "font-semibold"}`}>{a.titulo}</span>
                    {a.cuerpo && <span className="block text-sm text-ink-soft mt-0.5">{a.cuerpo}</span>}
                    <span className="block text-sm text-accent font-medium mt-1">{a.accion_label} →</span>
                  </span>
                  <span className="num text-xs text-ink-soft shrink-0">{formatFechaHora(a.updated_at)}</span>
                </span>
              </AbrirAviso>
            </li>
          ))}
        </ul>
      )}

      <Card className="mt-8 !p-5">
        <p className="font-semibold text-sm mb-2">Cómo te avisamos</p>
        <p className="text-sm text-ink-soft mb-3">
          Siempre ves los avisos acá. Además podés recibirlos por email.
        </p>
        <PreferenciaEmail inicial={prefs?.email ?? true} />
      </Card>
    </div>
  );
}

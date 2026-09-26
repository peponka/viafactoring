import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import {
  ESTADO_DEAL_ROOM_LABEL,
  estadoDealRoomTone,
  formatFechaHora,
} from "@/lib/format";
import type { RoomResumen } from "@/lib/deal-rooms";

// Bandeja "Te toca a vos": solo los Deal Rooms donde esta persona tiene algo
// pendiente. Es lo primero que se ve en el panel, para que nada se trabe
// porque alguien no sabía que le tocaba responder.
export function TeTocaAVos({ rooms }: { rooms: RoomResumen[] }) {
  const conPendientes = rooms.filter((r) => r.pendientes.length > 0 || r.noLeidos > 0);
  if (conPendientes.length === 0) return null;

  return (
    <Card className="mb-8 !p-5 border-accent">
      <p className="font-semibold mb-3">Te toca a vos</p>
      <ul className="flex flex-col gap-2">
        {conPendientes.map((r) => (
          <li key={r.revealId}>
            <Link
              href={`/deal-room/${r.revealId}`}
              className="flex items-center justify-between gap-3 rounded-lg px-3 py-2 hover:bg-surface-2 transition"
            >
              <span className="text-sm">
                <span className="font-medium">{r.titulo}</span>
                {r.subtitulo ? <span className="text-ink-soft"> · {r.subtitulo}</span> : null}
                <span className="block text-ink-soft">
                  {[...r.pendientes, r.noLeidos > 0 ? `${r.noLeidos} mensaje(s) sin leer` : null]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </span>
              <span className="text-accent text-sm font-medium shrink-0">Ir →</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export function DealRoomList({
  rooms,
  vacio,
}: {
  rooms: RoomResumen[];
  vacio: string;
}) {
  if (rooms.length === 0) {
    return (
      <Card className="text-center py-12">
        <p className="text-ink-soft">{vacio}</p>
      </Card>
    );
  }

  return (
    <div className="grid gap-3">
      {rooms.map((r) => (
        <Link key={r.revealId} href={`/deal-room/${r.revealId}`} className="block">
          <Card className="!p-5 hover:border-accent transition">
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                  <Badge tone={estadoDealRoomTone(r.estado)}>
                    {ESTADO_DEAL_ROOM_LABEL[r.estado]}
                  </Badge>
                  {r.pendientes.length > 0 && <Badge tone="warn">Te toca a vos</Badge>}
                  {r.noLeidos > 0 && <Badge tone="gold">{r.noLeidos} sin leer</Badge>}
                </div>
                <p className="font-medium">{r.titulo}</p>
                {r.subtitulo && <p className="text-ink-soft text-sm mt-1">{r.subtitulo}</p>}
              </div>
              <span className="num text-xs text-ink-soft">
                actividad {formatFechaHora(r.ultimaActividad)}
              </span>
            </div>
          </Card>
        </Link>
      ))}
    </div>
  );
}

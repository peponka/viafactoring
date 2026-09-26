import { getMisDealRooms } from "@/lib/deal-rooms";
import { DealRoomList, TeTocaAVos } from "@/components/deal-room-list";

export default async function OperadorDealRoomsPage() {
  const rooms = await getMisDealRooms("operador");
  const activos = rooms.filter((r) => r.estado !== "cancelled" && r.estado !== "closed");
  const cerrados = rooms.filter((r) => r.estado === "closed");
  const cancelados = rooms.filter((r) => r.estado === "cancelled");

  return (
    <div>
      <h1 className="text-2xl font-semibold mb-1">Deal Rooms</h1>
      <p className="text-ink-soft text-sm mb-8">
        Cada fondeador que desbloqueó una de tus facturas abre un Deal Room. Podés recibir ofertas
        de varios a la vez y compararlas antes de aceptar.
      </p>
      <TeTocaAVos rooms={rooms} />
      <DealRoomList rooms={activos} vacio="Todavía ningún fondeador desbloqueó tus facturas." />
      {cerrados.length > 0 && (
        <>
          <h2 className="font-semibold mt-8 mb-3">Operaciones cerradas</h2>
          <DealRoomList rooms={cerrados} vacio="" />
        </>
      )}
      {cancelados.length > 0 && (
        <details className="mt-8">
          <summary className="font-semibold cursor-pointer">Cancelados ({cancelados.length})</summary>
          <div className="mt-3">
            <DealRoomList rooms={cancelados} vacio="" />
          </div>
        </details>
      )}
    </div>
  );
}

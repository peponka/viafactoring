import { getMisDealRooms } from "@/lib/deal-rooms";
import { DealRoomList, TeTocaAVos } from "@/components/deal-room-list";

export default async function FondeadorDealRoomsPage() {
  const rooms = await getMisDealRooms("fondeador");
  const enCurso = rooms.filter((r) => r.estado === "open" || r.estado === "negotiating");
  const enCierre = rooms.filter((r) => r.estado === "offer_accepted" || r.estado === "closing");
  const cerrados = rooms.filter((r) => r.estado === "closed");
  const cancelados = rooms.filter((r) => r.estado === "cancelled");

  return (
    <div>
      <h1 className="text-[1.75rem] md:text-3xl font-bold mb-1.5">Negociaciones</h1>
      <p className="text-ink-soft mb-8">
        Cada factura en la que marcaste interés tiene su sala con la pyme: chat, documentos y
        ofertas en un solo lugar.
      </p>
      <TeTocaAVos rooms={rooms} />

      <h2 className="text-lg font-bold mb-3">En negociación</h2>
      <DealRoomList rooms={enCurso} vacio="No tenés negociaciones abiertas. Deslizá facturas en tu feed y tocá «Me interesa»." />

      {enCierre.length > 0 && (
        <>
          <h2 className="text-lg font-bold mt-8 mb-3">En cierre</h2>
          <DealRoomList rooms={enCierre} vacio="" />
        </>
      )}
      {cerrados.length > 0 && (
        <>
          <h2 className="text-lg font-bold mt-8 mb-3">Finalizadas</h2>
          <DealRoomList rooms={cerrados} vacio="" />
        </>
      )}
      {cancelados.length > 0 && (
        <details className="mt-8">
          <summary className="font-semibold cursor-pointer">Cerradas sin acuerdo ({cancelados.length})</summary>
          <div className="mt-3">
            <DealRoomList rooms={cancelados} vacio="" />
          </div>
        </details>
      )}
    </div>
  );
}

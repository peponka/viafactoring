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
      <h1 className="text-2xl font-semibold mb-1">Mis Deal Rooms</h1>
      <p className="text-ink-soft text-sm mb-8">
        Cada operación que desbloqueaste tiene su Deal Room: ahí están la información ampliada,
        los documentos, el chat con la PyME y las ofertas.
      </p>
      <TeTocaAVos rooms={rooms} />

      <h2 className="font-semibold mb-3">En análisis y negociación</h2>
      <DealRoomList rooms={enCurso} vacio="No tenés operaciones en análisis. Explorá el marketplace." />

      {enCierre.length > 0 && (
        <>
          <h2 className="font-semibold mt-8 mb-3">Oferta aceptada y formalización</h2>
          <DealRoomList rooms={enCierre} vacio="" />
        </>
      )}
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

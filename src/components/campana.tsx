import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { CampanaEnVivo } from "./campana-en-vivo";

// Campana de avisos: cuántos avisos sin leer tiene el usuario. Los avisos
// los crea la base en cada evento del Deal Room.
export async function Campana({ userId }: { userId: string }) {
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("leida_at", null);
  const n = count ?? 0;

  return (
    <>
      <CampanaEnVivo userId={userId} />
      <Link
        href="/notificaciones"
        className="relative inline-flex items-center justify-center w-9 h-9 rounded-full hover:bg-surface-2"
        aria-label={n > 0 ? `${n} avisos sin leer` : "Avisos"}
      >
        <span aria-hidden>🔔</span>
        {n > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-critical text-white text-[.65rem] font-semibold flex items-center justify-center num">
            {n > 99 ? "99+" : n}
          </span>
        )}
      </Link>
    </>
  );
}

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
        className="relative inline-flex items-center justify-center w-11 h-11 rounded-full border border-line bg-surface hover:border-line-strong"
        aria-label={n > 0 ? `${n} avisos sin leer` : "Avisos"}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" />
          <path d="M10.3 20a1.9 1.9 0 0 0 3.4 0" />
        </svg>
        {n > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-critical text-white text-[.65rem] font-semibold flex items-center justify-center num">
            {n > 99 ? "99+" : n}
          </span>
        )}
      </Link>
    </>
  );
}

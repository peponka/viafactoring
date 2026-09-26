"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

// Cuando llega un aviso nuevo, refresca la página para actualizar el
// contador (Realtime respeta la RLS: solo llegan los propios).
export function CampanaEnVivo({ userId }: { userId: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = createClient();
    const canal = supabase
      .channel(`avisos-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => router.refresh(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(canal);
    };
  }, [userId, router]);
  return null;
}

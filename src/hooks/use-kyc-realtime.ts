import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Keeps the member's KYC gate/banner in sync with reviewer decisions.
 *
 * Subscribes to the signed-in member's own profile row (RLS-scoped) plus their
 * KYC notification rows, and invalidates the KYC status query whenever a
 * reviewer approves, rejects, or otherwise changes the record — so the banner
 * refreshes without a manual reload.
 */
export function useKycRealtime(userId: string | undefined) {
  const qc = useQueryClient();

  useEffect(() => {
    if (!userId) return;

    const invalidate = () => {
      // Every member-facing surface that renders KYC state: the layout gate/banner,
      // the KYC page itself, and the profile record used by dashboard + settings.
      for (const queryKey of [
        ["my-kyc-gate"],
        ["my-kyc"],
        ["member", "kyc"],
        ["member", "profile"],
      ]) {
        void qc.invalidateQueries({ queryKey, refetchType: "all" });
      }
    };

    const channel = supabase
      .channel(`kyc-status-${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` },
        invalidate,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "kyc_notifications",
          filter: `member_id=eq.${userId}`,
        },
        invalidate,
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [qc, userId]);
}

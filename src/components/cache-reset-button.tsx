import { useState } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";

/**
 * One-click reset for stale app caches: unregisters service workers, clears
 * Cache Storage, then reloads with a cache-busting query param.
 */
export function CacheResetButton({
  variant = "outline",
  size = "sm",
  label = "Reset app cache",
}: {
  variant?: "outline" | "default" | "ghost" | "destructive";
  size?: "sm" | "default";
  label?: string;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <Button
      variant={variant}
      size={size}
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const { resetPwaCaches, reloadBypassingCache } = await import("@/lib/pwa-reset");
          const result = await resetPwaCaches();
          toast.success("Cache cleared", {
            description: `${result.serviceWorkers} service worker(s) and ${result.caches} cache bucket(s) removed. Reloading…`,
          });
          setTimeout(reloadBypassingCache, 600);
        } catch {
          setBusy(false);
          toast.error("Could not clear the app cache. Try a hard refresh.");
        }
      }}
    >
      <Trash2 className="mr-2 h-4 w-4" />
      {busy ? "Clearing…" : label}
    </Button>
  );
}

/**
 * Universal (UTC) clock shown in the portal header. Rendered client-side only
 * after mount so SSR output stays stable and never hydration-mismatches.
 */
import { useEffect, useState } from "react";
import { Globe } from "lucide-react";

function formatUtc(d: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(d);
}

export function UniversalClock() {
  const [now, setNow] = useState<Date | null>(null);

  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      title="Universal Coordinated Time (UTC)"
      className="hidden h-9 items-center gap-2 rounded-full border border-border bg-muted/60 px-3 text-xs font-medium tabular-nums text-muted-foreground backdrop-blur sm:flex"
    >
      <Globe className="size-3.5" />
      <span aria-live="off">{now ? formatUtc(now) : "--:--:--"}</span>
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground/70">UTC</span>
    </div>
  );
}

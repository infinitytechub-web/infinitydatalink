import { cn } from "@/lib/utils";

/**
 * Base skeleton — pulsing tinted surface with an overlaid shimmer sweep for
 * a more premium feel. Both animations are automatically neutralised by the
 * global `prefers-reduced-motion` rule in `styles.css`.
 */
function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "relative overflow-hidden rounded-md bg-primary/10",
        "animate-pulse",
        "before:absolute before:inset-0 before:-translate-x-full",
        "before:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.35),transparent)]",
        "motion-safe:before:animate-[shimmer_1.6s_ease-in-out_infinite]",
        "dark:before:bg-[linear-gradient(90deg,transparent,rgba(255,255,255,0.06),transparent)]",
        className,
      )}
      {...props}
    />
  );
}

export { Skeleton };

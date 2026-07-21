// Real-time runtime error logger. Best-effort — never throws to callers,
// never blocks the UI, and safely no-ops during SSR.
import { supabase } from "@/integrations/supabase/client";

export type ErrorKind = "route" | "api" | "rbac" | "render" | "network" | "server" | "other";
export type ErrorSeverity = "error" | "warning" | "info";

export type LogErrorInput = {
  kind: ErrorKind;
  message: string;
  severity?: ErrorSeverity;
  route?: string;
  stack?: string;
  actorRole?: string;
  meta?: Record<string, unknown>;
};

// Simple in-memory dedupe: skip identical (kind|message|route) within 5s.
const recent = new Map<string, number>();
const DEDUPE_MS = 5000;

function shouldSkip(key: string): boolean {
  const now = Date.now();
  const last = recent.get(key);
  if (last && now - last < DEDUPE_MS) return true;
  recent.set(key, now);
  // Prune periodically.
  if (recent.size > 200) {
    for (const [k, t] of recent) if (now - t > DEDUPE_MS) recent.delete(k);
  }
  return false;
}

function clip(s: string | undefined, max: number): string | undefined {
  if (!s) return undefined;
  return s.length > max ? s.slice(0, max) : s;
}

export async function logRuntimeError(input: LogErrorInput): Promise<void> {
  if (typeof window === "undefined") return;
  const route = input.route ?? window.location.pathname + window.location.search;
  const message = clip(input.message, 4000) ?? "Unknown error";
  const key = `${input.kind}|${message}|${route}`;
  if (shouldSkip(key)) return;

  try {
    const { data: session } = await supabase.auth.getSession();
    const user = session.session?.user ?? null;
    await supabase.from("runtime_error_logs").insert({
      kind: input.kind,
      severity: input.severity ?? "error",
      route,
      message,
      stack: clip(input.stack, 20000) ?? null,
      user_id: user?.id ?? null,
      user_email: user?.email ?? null,
      actor_role: input.actorRole ?? null,
      user_agent: clip(navigator.userAgent, 500) ?? null,
      meta: input.meta ?? {},
    });
  } catch {
    // Never propagate logger failures.
  }
}

let installed = false;

export function installGlobalErrorHandlers(): void {
  if (installed || typeof window === "undefined") return;
  installed = true;

  window.addEventListener("error", (event: ErrorEvent) => {
    const err = event.error;
    void logRuntimeError({
      kind: "render",
      message: err?.message ?? event.message ?? "Uncaught error",
      stack: err?.stack,
      meta: {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        source: "window.onerror",
      },
    });
  });

  window.addEventListener("unhandledrejection", (event: PromiseRejectionEvent) => {
    const reason = event.reason;
    const message =
      reason instanceof Error
        ? reason.message
        : typeof reason === "string"
          ? reason
          : (() => {
              try {
                return JSON.stringify(reason);
              } catch {
                return "Unhandled promise rejection";
              }
            })();
    void logRuntimeError({
      kind: "api",
      message,
      stack: reason instanceof Error ? reason.stack : undefined,
      meta: { source: "unhandledrejection" },
    });
  });
}

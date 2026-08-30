import { Component, Suspense, type ReactNode, type ErrorInfo } from "react";
import { QueryErrorResetBoundary } from "@tanstack/react-query";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { reportLovableError } from "@/lib/lovable-error-reporting";
import { logRuntimeError } from "@/lib/runtime-error-logger";

type FallbackProps = { error: Error; retry: () => void };

type Props = {
  children: ReactNode;
  /** Optional label shown while loading. */
  loadingLabel?: string;
  /** Custom pending UI; overrides the default skeleton. */
  pendingFallback?: ReactNode;
  /** Custom error UI. */
  errorFallback?: (props: FallbackProps) => ReactNode;
  /** Called when the retry button is pressed (in addition to resetting the boundary). */
  onRetry?: () => void;
  /** Tag used when logging errors. */
  name?: string;
  className?: string;
};

type State = { error: Error | null };

class ErrorBoundary extends Component<
  {
    children: ReactNode;
    onReset: () => void;
    resetKeys?: unknown[];
    fallback: (props: FallbackProps) => ReactNode;
    name?: string;
  },
  State
> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error);
    reportLovableError(error, { boundary: "async_boundary", name: this.props.name });
    void logRuntimeError({
      kind: "route",
      message: error.message,
      stack: error.stack,
      meta: {
        boundary: "async_boundary",
        name: this.props.name,
        componentStack: info.componentStack,
      },
    });
  }

  componentDidUpdate(prev: Readonly<{ resetKeys?: unknown[] }>) {
    const a = prev.resetKeys ?? [];
    const b = this.props.resetKeys ?? [];
    if (this.state.error && (a.length !== b.length || a.some((v, i) => v !== b[i]))) {
      this.setState({ error: null });
    }
  }

  reset = () => {
    this.setState({ error: null });
    this.props.onReset();
  };

  render() {
    if (this.state.error) {
      return this.props.fallback({ error: this.state.error, retry: this.reset });
    }
    return this.props.children;
  }
}

function DefaultPending({ label, className }: { label?: string; className?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border border-border/60 bg-card/40 p-8 text-sm text-muted-foreground",
        className,
      )}
    >
      <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
      <span>{label ?? "Loading…"}</span>
    </div>
  );
}

function DefaultError({ error, retry, className }: FallbackProps & { className?: string }) {
  return (
    <div
      role="alert"
      className={cn(
        "flex min-h-[240px] flex-col items-center justify-center gap-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center",
        className,
      )}
    >
      <AlertTriangle className="size-6 text-destructive" aria-hidden="true" />
      <div className="space-y-1">
        <p className="text-sm font-semibold text-foreground">
          Something went wrong loading this section.
        </p>
        <p className="max-w-md text-xs text-muted-foreground break-words">
          {error.message || "An unexpected error occurred."}
        </p>
      </div>
      <button
        type="button"
        onClick={retry}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground shadow transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <RefreshCw className="size-3.5" aria-hidden="true" />
        Try again
      </button>
    </div>
  );
}

/**
 * Combines a React Suspense boundary with a resettable error boundary.
 * On retry it clears the error state, calls the caller's onRetry (typically
 * `router.invalidate()`), and resets any TanStack Query error state so
 * suspense queries refetch instead of leaving the UI blank.
 */
export function AsyncBoundary({
  children,
  loadingLabel,
  pendingFallback,
  errorFallback,
  onRetry,
  name,
  className,
}: Props) {
  return (
    <QueryErrorResetBoundary>
      {({ reset }) => (
        <ErrorBoundary
          name={name}
          onReset={() => {
            reset();
            onRetry?.();
          }}
          fallback={({ error, retry }) =>
            errorFallback ? (
              errorFallback({ error, retry })
            ) : (
              <DefaultError error={error} retry={retry} className={className} />
            )
          }
        >
          <Suspense
            fallback={
              pendingFallback ?? <DefaultPending label={loadingLabel} className={className} />
            }
          >
            {children}
          </Suspense>
        </ErrorBoundary>
      )}
    </QueryErrorResetBoundary>
  );
}

export type { FallbackProps as AsyncBoundaryFallbackProps };

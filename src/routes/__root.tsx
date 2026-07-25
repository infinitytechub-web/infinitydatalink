import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/components/theme-provider";
import { BrandingProvider } from "@/components/branding-provider";
import { AsyncBoundary } from "@/components/async-boundary";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4 font-sans">
      <div className="max-w-md text-center">
        <h1 className="font-serif text-7xl text-emerald-deep">404</h1>
        <h2 className="mt-4 font-serif text-xl text-emerald-deep">Page not found</h2>
        <p className="mt-2 text-sm text-emerald-deep/60">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-emerald-deep px-4 py-2 text-sm font-medium text-cream transition-colors hover:bg-emerald-mid"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
    void import("@/lib/runtime-error-logger").then((m) =>
      m.logRuntimeError({
        kind: "route",
        message: error.message,
        stack: error.stack,
        meta: { boundary: "tanstack_root_error_component" },
      }),
    );
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-cream px-4 font-sans">
      <div className="max-w-md text-center">
        <h1 className="font-serif text-xl text-emerald-deep">This page didn't load</h1>
        <p className="mt-2 text-sm text-emerald-deep/60">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-emerald-deep px-4 py-2 text-sm font-medium text-cream transition-colors hover:bg-emerald-mid"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-emerald-deep/20 bg-transparent px-4 py-2 text-sm font-medium text-emerald-deep transition-colors hover:bg-emerald-deep/5"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "theme-color", content: "#0d9488" },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "IT-360 CashApp" },
      { name: "twitter:card", content: "summary_large_image" },
      { title: "IT-360 CashApp — Enterprise Financial Management Platform" },
      { property: "og:title", content: "IT-360 CashApp — Enterprise Financial Management Platform" },
      { name: "twitter:title", content: "IT-360 CashApp — Enterprise Financial Management Platform" },
      { name: "description", content: "One platform for savings, loans, payments, and investment — built for cooperatives, SACCOs, and membership organisations." },
      { property: "og:description", content: "One platform for savings, loans, payments, and investment — built for cooperatives, SACCOs, and membership organisations." },
      { name: "twitter:description", content: "One platform for savings, loans, payments, and investment — built for cooperatives, SACCOs, and membership organisations." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/oKYJ4nzjn7abpsUlqLaAW6BjMb12/social-images/social-1783555926945-cyber_1.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/oKYJ4nzjn7abpsUlqLaAW6BjMb12/social-images/social-1783555926945-cyber_1.webp" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "IT-360 CashApp",
          url: "https://infinity-wealth360.lovable.app",
          logo: "https://infinity-wealth360.lovable.app/icon-512.png",
          description:
            "Enterprise financial management platform for cooperatives, SACCOs, and membership organisations.",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "IT-360 CashApp",
          url: "https://infinity-wealth360.lovable.app",
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    // Fire-and-forget: dynamic import so SSR bundle stays lean.
    void import("@/lib/runtime-error-logger").then((m) => m.installGlobalErrorHandlers());
    void import("@/lib/web-vitals-reporter").then((m) => m.installWebVitalsReporter());
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <BrandingProvider>
          <AuthProvider>
            <AsyncBoundary
              name="root_outlet"
              loadingLabel="Loading…"
              onRetry={() => router.invalidate()}
            >
              <Outlet />
            </AsyncBoundary>
          </AuthProvider>
        </BrandingProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}


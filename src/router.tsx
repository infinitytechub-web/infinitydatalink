import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        // Keep query data fresh across quick navigations to avoid refetch churn.
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Preload on link hover/focus so navigations feel instant.
    defaultPreload: "intent",
    // Cached preloads stay fresh 30s; Query controls freshness beyond that.
    defaultPreloadStaleTime: 30_000,
    defaultPreloadGcTime: 5 * 60_000,
  });

  return router;
};

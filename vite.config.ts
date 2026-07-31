// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { fileURLToPath } from "node:url";
import { visualizer } from "rollup-plugin-visualizer";

const realtimeSsrStub = fileURLToPath(
  new URL("./src/integrations/supabase/realtime-ssr-stub.ts", import.meta.url),
);

// tslib ships a UMD CommonJS entry (`tslib.js`) that the Worker bundler cannot
// interop correctly: `tslib/modules/index.js` does `import tslib from
// '../tslib.js'` and destructures it, which evaluates to `undefined` in the
// bundled output and throws
// `Cannot destructure property '__extends' of '__toESM(...).default'`
// at module-init time. Because that chunk also carries shared runtime
// polyfills, the throw took down SSR for EVERY route (production returned the
// 500 error page). Pointing tslib at its real ESM build removes the CJS
// interop entirely.
const tslibEsm = fileURLToPath(new URL("./node_modules/tslib/tslib.es6.mjs", import.meta.url));


// Opt-in bundle analyzer: run `BUNDLE_ANALYZE=1 bun run build` to emit
// dist/stats.html with an interactive treemap of the client bundle.
const analyze = process.env.BUNDLE_ANALYZE === "1";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [
      {
        // SSR-only alias: swap @supabase/realtime-js for an inert stub in
        // the server bundle. Realtime is a browser-only feature here; the
        // real module drags tslib/CJS-interop-hostile deps into the
        // Cloudflare Worker build and crashes at module init. Browser
        // bundle is untouched, so client-side realtime subscriptions keep
        // working as normal.
        name: "ssr-stub-supabase-realtime",
        enforce: "pre",
        applyToEnvironment(env: { name: string }) {
          return env.name !== "client";
        },
        resolveId(source: string) {
          if (source === "@supabase/realtime-js") return realtimeSsrStub;
          return null;
        },
      },
      {
        // Resolve every `tslib` request to its ESM build (see note above).
        name: "tslib-esm-only",
        enforce: "pre",
        resolveId(source: string) {
          if (source === "tslib" || source === "tslib/modules/index.js") return tslibEsm;
          return null;
        },
      },

      ...(analyze
        ? [
            visualizer({
              filename: "dist/stats.html",
              gzipSize: true,
              brotliSize: true,
              template: "treemap",
            }),
          ]
        : []),
    ],
  },
});

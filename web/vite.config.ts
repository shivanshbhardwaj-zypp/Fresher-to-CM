import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * The page is served from a path on an existing domain
 * (https://zypp.app/bano-zypp-ke-cm), not from a root.
 *
 * `base` is what makes that work: every emitted asset URL is written with the
 * prefix, so the browser asks for /bano-zypp-ke-cm/assets/… instead of
 * /assets/…, which on zypp.app would collide with the main site's own assets
 * and 404. It also feeds `import.meta.env.BASE_URL`, which the API service uses
 * to build its endpoint — see src/services/cmApplicationService.ts.
 */
/**
 * Mirrors what nginx does in production.
 *
 * `base` applies in dev too, so the app requests
 * /bano-zypp-ke-cm/api/cm-applications here exactly as it will on zypp.app.
 * The rewrite strips the prefix before forwarding, which is the same thing the
 * trailing slash on nginx's `proxy_pass` does — so the API only ever sees
 * /api/... and never has to know where it is mounted publicly.
 *
 * Proxying rather than pointing at http://localhost:3001 directly keeps dev
 * same-origin, so CORS problems surface in production instead of being masked
 * locally — or, better, never exist at all.
 */
const API_PROXY = {
  "/bano-zypp-ke-cm/api": {
    target: "http://localhost:3001",
    changeOrigin: true,
    rewrite: (path: string) => path.replace(/^\/bano-zypp-ke-cm/, ""),
  },
};

export default defineConfig({
  base: "/bano-zypp-ke-cm/",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: API_PROXY,
  },
  // `vite preview` serves the real production build, so it needs the same
  // proxy — otherwise the only way to exercise a built artifact is to deploy it.
  preview: {
    port: 4173,
    proxy: API_PROXY,
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
});

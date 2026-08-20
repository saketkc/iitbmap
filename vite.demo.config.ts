import { defineConfig } from "vite";

// Demo-only config; the package itself builds via tsup (see tsup.config.ts).
// root=demo lets main.ts import "../src/index" directly (no build step needed
// to test changes); publicDir=assets serves the committed fonts/ (and, if you
// copy/symlink one in locally, a tiles/ dir) at "/fonts/..." / "/tiles/...".
export default defineConfig({
  root: "demo",
  publicDir: "../assets",
  server: { port: 5183 },
});

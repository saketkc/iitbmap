import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Demo-only config; the package itself builds via tsup (see tsup.config.ts).
// root=demo lets App.tsx import "../../src/index" directly (no build step needed
// to test changes); publicDir=assets serves the committed fonts/ (and, if you
// copy/symlink one in locally, a tiles/ dir) at "/fonts/..." / "/tiles/...".
export default defineConfig({
  root: "demo",
  publicDir: "../assets",
  server: { port: 5183 },
  plugins: [react(), tailwindcss()],
  resolve: { alias: { "@": path.resolve(__dirname, "demo/src") } },
});

// Static share page and og.png per building; link-preview crawlers don't run JS.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Plugin } from "vite";
import { renderAsync } from "@resvg/resvg-js";
import type { Feature, Polygon } from "geojson";
import { buildingCentroid, IITB_BUILDINGS } from "../src/index";
import { buildingScene, loadBasemap, sceneSvg, sceneView } from "./og/render";
import { shareMetaTags } from "./og/meta";
import { buildingPath, buildingSlug } from "./src/lib/building-url";
import { encodeDigipin } from "./src/lib/digipin";
import { SITE_TITLE } from "./src/lib/places";

const here = path.dirname(fileURLToPath(import.meta.url));
const FONT_FILES = ["inter-400.ttf", "inter-700.ttf"].map((f) => path.resolve(here, "og/fonts", f));
const META_BLOCK = /<!-- share-meta[^>]*-->[\s\S]*?<!-- \/share-meta -->/;

async function renderBuilding(dir: string, name: string, feature: Feature<Polygon>) {
  const scene = buildingScene(name, feature);
  const basemap = await loadBasemap(sceneView(scene).box, (url) => console.warn(`share-pages: skipped tile ${url}`));
  const image = await renderAsync(sceneSvg(basemap, scene), {
    font: { fontFiles: FONT_FILES, loadSystemFonts: false, defaultFontFamily: "Inter" },
  });
  fs.writeFileSync(path.join(dir, "og.png"), image.asPng());
}

export function sharePages(): Plugin {
  let outDir = "";
  return {
    name: "iitbmap-share-pages",
    apply: "build",
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir);
    },
    async closeBundle() {
      const shell = fs.readFileSync(path.join(outDir, "index.html"), "utf8");
      if (!META_BLOCK.test(shell)) throw new Error("share-pages: index.html has no <!-- share-meta --> block");
      const siteUrl = shell.match(/<link rel="canonical" href="([^"]+)"/)![1];

      const jobs: (() => Promise<void>)[] = [];
      const seen = new Set<string>();
      for (const f of IITB_BUILDINGS.features) {
        const name = f.properties?.name as string | undefined;
        if (!name) continue;
        const slug = buildingSlug(name);
        // first feature per slug wins, like the app's name lookup
        if (seen.has(slug)) continue;
        seen.add(slug);
        const feature = f as Feature<Polygon>;
        const url = new URL(buildingPath(name), siteUrl).href;
        // same point the app routes to
        const description = `${name} (DIGIPIN ${encodeDigipin(buildingCentroid(feature))}) on the IIT Bombay campus map, with walking and driving directions from anywhere on campus.`;
        const meta = shareMetaTags({
          title: `${name} | ${SITE_TITLE}`,
          description,
          url,
          canonical: url,
          image: `${url}og.png`,
          imageAlt: `Map of ${name}, IIT Bombay`,
          imageIsPreview: true,
        });

        const dir = path.join(outDir, buildingPath(name));
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, "index.html"), shell.replace(META_BLOCK, meta));
        jobs.push(() => renderBuilding(dir, name, feature));
      }

      // resvg-js renders off-thread; one job per core
      const queue = jobs.values();
      const worker = async () => {
        for (const job of queue) await job();
      };
      await Promise.all(Array.from({ length: os.availableParallelism() }, worker));
      console.log(`share-pages: wrote ${seen.size} building pages`);
    },
  };
}

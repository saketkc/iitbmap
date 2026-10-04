// Route share links: /r serves route OG tags then redirects to the app; /og.png renders the image.
import { initWasm, Resvg } from "@resvg/resvg-wasm";
import resvgWasm from "@resvg/resvg-wasm/index_bg.wasm";
import inter400 from "../demo/og/fonts/inter-400.ttf";
import inter700 from "../demo/og/fonts/inter-700.ttf";
import { findRoutes, type Route } from "../src/index";
import { buildingPath } from "../demo/src/lib/building-url";
import { findBuilding, formatRouteInfo, resolvePlace, SITE_TITLE } from "../demo/src/lib/places";
import { readSharedRoute, routeLink, writeSharedRoute, type SharedRoute } from "../demo/src/lib/route-url";
import { esc, loadBasemap, routeScene, sceneSvg, sceneView } from "../demo/og/render";
import { shareMetaTags } from "../demo/og/meta";

interface Env {
  APP_URL: string;
}

let wasmReady: Promise<void> | undefined;
const FONTS = [new Uint8Array(inter400), new Uint8Array(inter700)];

function resolveRoute(shared: SharedRoute): Route | undefined {
  const from = resolvePlace(shared.from);
  const to = resolvePlace(shared.to);
  if (!from || !to) return undefined; // e.g. "My current location": no fixed start to draw
  const routes = findRoutes(from, to, shared.profile, shared.routeIndex + 1);
  return routes[Math.min(shared.routeIndex, routes.length - 1)];
}

function sharePage(env: Env, url: URL, shared: SharedRoute): Response {
  const route = resolveRoute(shared);
  const target = routeLink(env.APP_URL, shared).href;
  const dest = findBuilding(shared.to);
  const { title, description, image } = route
    ? {
        title: `${shared.from} to ${shared.to} | ${SITE_TITLE}`,
        description: `${formatRouteInfo(route, shared.profile)} from ${shared.from} to ${shared.to} on the IIT Bombay campus map.`,
        image: writeSharedRoute(new URL("/og.png", url), shared).href,
      }
    : {
        // Undrawable route (unknown or live-location start): use the destination's preview.
        title: `Directions to ${shared.to} | ${SITE_TITLE}`,
        description: `${shared.profile === "walk" ? "Walking" : "Driving"} directions to ${shared.to} on the IIT Bombay campus map.`,
        image: new URL(dest ? buildingPath(shared.to.trim()) + "og.png" : "icons/icon-512.png", env.APP_URL).href,
      };
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  ${shareMetaTags({ title, description, url: url.href, canonical: target, image, imageAlt: title, imageIsPreview: !!(route || dest) })}
  <meta http-equiv="refresh" content="0; url=${esc(target)}" />
</head>
<body>
  <p><a href="${esc(target)}">Open directions to ${esc(shared.to)}</a></p>
  <script>location.replace(${JSON.stringify(target).replace(/</g, "\\u003c")});</script>
</body>
</html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=3600" } });
}

async function routeImage(request: Request, url: URL, shared: SharedRoute, ctx: ExecutionContext): Promise<Response> {
  // canonical key so param order doesn't fragment the cache
  const key = new Request(writeSharedRoute(new URL("/og.png", url), shared).href);
  // the Cache API is a no-op on *.workers.dev; it works on a custom domain
  const cached = await caches.default.match(key);
  if (cached) return cached;

  const route = resolveRoute(shared);
  if (!route) return new Response("No route", { status: 404 });
  const scene = routeScene(shared.from, shared.to, route, shared.profile, findBuilding(shared.to));
  const [basemap] = await Promise.all([loadBasemap(sceneView(scene).box), (wasmReady ??= initWasm(resvgWasm))]);
  const png = new Resvg(sceneSvg(basemap, scene), {
    font: { fontBuffers: FONTS, loadSystemFonts: false, defaultFontFamily: "Inter" },
  }).render().asPng();

  const response = new Response(png, { headers: { "content-type": "image/png", "cache-control": "public, max-age=604800" } });
  if (request.method === "GET") ctx.waitUntil(caches.default.put(key, response.clone()));
  return response;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== "GET" && request.method !== "HEAD") return new Response("Method not allowed", { status: 405 });
    const shared = readSharedRoute(url);
    if (url.pathname === "/r" || url.pathname === "/r/") return shared ? sharePage(env, url, shared) : Response.redirect(env.APP_URL, 302);
    if (url.pathname === "/og.png" && shared) return routeImage(request, url, shared, ctx);
    return Response.redirect(env.APP_URL, 302);
  },
};

import type { RoutingProfile } from "../../../src/index";
import { buildingPath } from "./building-url";
import { findBuilding } from "./places";

export interface SharedRoute {
  from: string;
  to: string;
  profile: RoutingProfile;
  routeIndex: number;
}

export function readSharedRoute(url: URL): SharedRoute | null {
  const from = url.searchParams.get("from")?.trim();
  const to = url.searchParams.get("to")?.trim();
  if (!from || !to) return null;

  const profile = url.searchParams.get("profile") === "drive" ? "drive" : "walk";
  const requestedIndex = Number(url.searchParams.get("route") ?? 0);
  const routeIndex = Number.isInteger(requestedIndex) && requestedIndex >= 0 ? requestedIndex : 0;

  return { from, to, profile, routeIndex };
}

/** App link for a route, under the destination's /b/<slug>/ page when it's a building. */
export function routeLink(appBase: string | URL, route: SharedRoute): URL {
  const url = new URL(appBase);
  url.search = "";
  if (findBuilding(route.to)) url.pathname = new URL(buildingPath(route.to.trim()), url).pathname;
  return writeSharedRoute(url, route);
}

/** Updates a URL in place, preserving unrelated query parameters and its hash. */
export function writeSharedRoute(url: URL, route: SharedRoute): URL {
  url.searchParams.set("from", route.from);
  url.searchParams.set("to", route.to);
  url.searchParams.set("profile", route.profile);
  if (route.routeIndex > 0) url.searchParams.set("route", String(route.routeIndex));
  else url.searchParams.delete("route");
  return url;
}

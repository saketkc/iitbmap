import type { Feature, Polygon } from "geojson";
import { IITB_BUILDINGS, buildingCentroid, inCampusBbox, type Route, type RoutingProfile } from "../../../src/index";
import { decodeDigipin } from "./digipin";

export const MY_LOCATION_LABEL = "My current location";
export const SITE_TITLE = "IIT Bombay Campus Map";
/** Start/destination markers and the selected route line, in the app and in link previews. */
export const MARKER_COLORS = { start: "#16a34a", end: "#dc2626", route: "#2563eb" } as const;

export function findBuilding(name: string): Feature<Polygon> | undefined {
  const key = name.trim().toLowerCase();
  return IITB_BUILDINGS.features.find((f) => f.properties?.name?.toLowerCase() === key) as Feature<Polygon> | undefined;
}

export function findBuildingCentroid(name: string): [number, number] | undefined {
  const feature = findBuilding(name);
  return feature ? buildingCentroid(feature) : undefined;
}

/** A building name or an on-campus DIGIPIN, as [lng, lat]. */
export function resolvePlace(value: string): [number, number] | undefined {
  const building = findBuildingCentroid(value);
  if (building) return building;
  const pin = decodeDigipin(value);
  return pin && inCampusBbox(pin[1], pin[0]) ? pin : undefined;
}

export function formatRouteInfo(route: Route, profile: RoutingProfile, sep = ", "): string {
  const km = route.distanceMeters / 1000;
  const speedKmh = profile === "walk" ? 5 : 20;
  const minutes = Math.round((km / speedKmh) * 60);
  return `${km.toFixed(2)} km${sep}~${minutes} min ${profile === "walk" ? "walking" : "driving"}`;
}

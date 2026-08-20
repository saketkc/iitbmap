import { describe, expect, it } from "vitest";
import { findRoute, findRoutes } from "../src/routing";
import { buildingCentroid, IITB_BUILDINGS } from "../src/buildings";
import type { Feature, Polygon } from "geojson";

const from = buildingCentroid(IITB_BUILDINGS.features[0] as Feature<Polygon>);
const to = buildingCentroid(IITB_BUILDINGS.features[IITB_BUILDINGS.features.length - 1] as Feature<Polygon>);

describe("findRoute", () => {
  it.each(["walk", "drive"] as const)("finds a %s route between two campus buildings", (profile) => {
    const route = findRoute(from, to, profile);
    expect(route).not.toBeNull();
    expect(route!.coordinates.length).toBeGreaterThan(1);
    expect(route!.coordinates[0]).toEqual(from);
    expect(route!.coordinates[route!.coordinates.length - 1]).toEqual(to);
    expect(route!.distanceMeters).toBeGreaterThan(0);
    expect(Number.isFinite(route!.distanceMeters)).toBe(true);
  });

  it("routing a point to itself only pays the round-trip snap to the street network", () => {
    const route = findRoute(from, from, "walk");
    expect(route).not.toBeNull();
    expect(route!.distanceMeters).toBeLessThan(1000);
  });

  // Regression guard: a walk-graph coverage gap once left a building snapped to a
  // street node over 1km away, drawing a route straight across the lake.
  it.each(IITB_BUILDINGS.features.filter((_, i) => i % 15 === 0))(
    "snaps $properties.name to a nearby walk-network node",
    (feature) => {
      const point = buildingCentroid(feature as Feature<Polygon>);
      const route = findRoute(point, point, "walk");
      expect(route!.distanceMeters).toBeLessThan(600);
    },
  );
});

describe("findRoutes", () => {
  it.each(["walk", "drive"] as const)("returns up to k %s routes, ranked shortest first", (profile) => {
    const routes = findRoutes(from, to, profile, 3);
    expect(routes.length).toBeGreaterThan(0);
    expect(routes.length).toBeLessThanOrEqual(3);
    for (let i = 1; i < routes.length; i++) {
      expect(routes[i].distanceMeters).toBeGreaterThanOrEqual(routes[i - 1].distanceMeters);
    }
  });

  it("returns distinct route shapes, not the same path repeated", () => {
    const routes = findRoutes(from, to, "walk", 3);
    const shapes = new Set(routes.map((r) => JSON.stringify(r.coordinates)));
    expect(shapes.size).toBe(routes.length);
  });

  it("findRoute(...) matches the first result of findRoutes(..., 1)", () => {
    const single = findRoute(from, to, "walk");
    const [first] = findRoutes(from, to, "walk", 1);
    expect(single).toEqual(first);
  });
});

import { describe, expect, it } from "vitest";
import { buildingLabelLayer, BUILDINGS_SOURCE_ID, IITB_BUILDINGS } from "../src/buildings";

describe("IITB_BUILDINGS", () => {
  it("is a non-empty FeatureCollection", () => {
    expect(IITB_BUILDINGS.type).toBe("FeatureCollection");
    expect(IITB_BUILDINGS.features.length).toBeGreaterThan(0);
  });
});

describe("buildingLabelLayer", () => {
  it("reads from the buildings source and labels by name", () => {
    const layer = buildingLabelLayer();
    expect(layer.source).toBe(BUILDINGS_SOURCE_ID);
    expect(layer.layout?.["text-field"]).toEqual(["get", "name"]);
  });

  it("uses a different text color for dark mode", () => {
    const light = buildingLabelLayer({ dark: false });
    const dark = buildingLabelLayer({ dark: true });
    expect(light.paint?.["text-color"]).not.toBe(dark.paint?.["text-color"]);
  });
});

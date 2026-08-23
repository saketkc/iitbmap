import { describe, expect, it } from "vitest";
import { campusLayers, getCampusStyle, mergeCampusLayers } from "../src/style";

describe("campusLayers", () => {
  it("defines one layer per campus source-layer, bottom to top", () => {
    expect(campusLayers().map((l) => l.id)).toEqual([
      "campus-green",
      "campus-parking",
      "campus-streets",
      "campus-building",
      "campus-water",
      "campus-waterway",
    ]);
  });

  it("every layer reads from the campus vector source", () => {
    for (const layer of campusLayers()) {
      expect(layer.source).toBe("campus");
    }
  });

  it("light and dark produce different paint colors per layer", () => {
    const light = campusLayers(false);
    const dark = campusLayers(true);
    for (let i = 0; i < light.length; i++) {
      expect(light[i].paint).not.toEqual(dark[i].paint);
    }
  });

  it("building and streets invert (dark-on-light <-> light-on-dark) rather than just dimming", () => {
    const paintOf = (dark: boolean, id: string, prop: string): string => {
      const layer = campusLayers(dark).find((l) => l.id === id)!;
      return (layer.paint as Record<string, unknown> | undefined)?.[prop] as string;
    };

    expect(hexLightness(paintOf(false, "campus-building", "fill-color"))).toBeLessThan(
      hexLightness(paintOf(true, "campus-building", "fill-color")),
    );
    expect(hexLightness(paintOf(false, "campus-streets", "line-color"))).toBeLessThan(
      hexLightness(paintOf(true, "campus-streets", "line-color")),
    );
  });
});

function hexLightness(hex: string): number {
  const n = parseInt(hex.replace("#", ""), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  return (r + g + b) / 3;
}

describe("getCampusStyle", () => {
  it("requires a tileUrl/glyphsUrl when neither an override nor a default is available", () => {
    expect(() => getCampusStyle({ tileUrl: "", glyphsUrl: "" })).toThrow(/no (tileUrl|glyphsUrl) configured/);
  });

  it("falls back to the package's default tileUrl/glyphsUrl when none is passed", () => {
    const style = getCampusStyle();
    expect(style.sources.campus).toBeDefined();
  });

  it("builds a full style when urls are passed explicitly", () => {
    const style = getCampusStyle({ tileUrl: "https://example.com/{z}/{x}/{y}.pbf", glyphsUrl: "https://example.com/{fontstack}/{range}.pbf" });
    expect(style.sources.campus).toBeDefined();
    expect(style.sources.buildings).toBeDefined();
    expect(style.layers.map((l) => l.id)).toContain("campus-building");
    expect(style.layers.map((l) => l.id)).toContain("building-label");
  });
});

describe("mergeCampusLayers", () => {
  const baseUrl = { tileUrl: "https://example.com/{z}/{x}/{y}.pbf" };

  it("appends campus layers to an existing style by default", () => {
    const base = { version: 8 as const, sources: {}, layers: [{ id: "my-layer", type: "background" as const, paint: {} }] };
    const merged = mergeCampusLayers(base, baseUrl);
    expect(merged.layers[0].id).toBe("my-layer");
    expect(merged.layers.at(-1)?.id).toBe("campus-waterway");
  });

  it("inserts before a given layer id when beforeId is set", () => {
    const base = { version: 8 as const, sources: {}, layers: [{ id: "markers", type: "circle" as const, source: "x", paint: {} }] };
    const merged = mergeCampusLayers(base, { ...baseUrl, beforeId: "markers" });
    expect(merged.layers[0].id).toBe("campus-green");
    expect(merged.layers.at(-1)?.id).toBe("markers");
  });

  it("throws if the target style already has a source with the same id", () => {
    const base = { version: 8 as const, sources: { campus: { type: "vector" as const, tiles: [] } }, layers: [] };
    expect(() => mergeCampusLayers(base, baseUrl)).toThrow(/already has a source/);
  });
});

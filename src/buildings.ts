import type { Map as MaplibreMap, SymbolLayerSpecification } from "maplibre-gl";
import type { Feature, FeatureCollection, Polygon } from "geojson";
import buildings from "./iitb-buildings.json";
import { MIN_ZOOM } from "./geo";

export const IITB_BUILDINGS = buildings as FeatureCollection;

export const BUILDINGS_SOURCE_ID = "buildings";
export const BUILDING_LABEL_LAYER_ID = "building-label";

const LABEL_COLOR = { light: "#44403c", dark: "#d6d3d1" } as const;
const LABEL_HALO = { light: "#ffffff", dark: "#14171a" } as const;

/** Requires a configured glyph URL because the basemap supplies none. */
export function buildingLabelLayer(opts: { dark?: boolean } = {}): SymbolLayerSpecification {
  const theme = opts.dark ? "dark" : "light";
  return {
    id: BUILDING_LABEL_LAYER_ID,
    type: "symbol",
    source: BUILDINGS_SOURCE_ID,
    minzoom: MIN_ZOOM,
    layout: {
      "text-field": ["get", "name"],
      "text-font": ["Noto Sans Regular"],
      "text-size": ["interpolate", ["linear"], ["zoom"], MIN_ZOOM, 7, 18, 12],
      "text-max-width": 8,
      "symbol-avoid-edges": true,
    },
    paint: {
      "text-color": LABEL_COLOR[theme],
      "text-halo-color": LABEL_HALO[theme],
      "text-halo-width": 1.2,
    },
  };
}

export function setBuildingLabelsVisible(map: MaplibreMap, visible: boolean): void {
  if (map.getLayer(BUILDING_LABEL_LAYER_ID)) {
    map.setLayoutProperty(BUILDING_LABEL_LAYER_ID, "visibility", visible ? "visible" : "none");
  }
}

export function buildingCentroid(feature: Feature<Polygon>): [number, number] {
  const ring = feature.geometry.coordinates[0];
  let x = 0;
  let y = 0;
  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const cross = x0 * y1 - x1 * y0;
    area += cross;
    x += (x0 + x1) * cross;
    y += (y0 + y1) * cross;
  }
  area /= 2;
  if (area === 0) return ring[0] as [number, number];
  return [x / (6 * area), y / (6 * area)];
}

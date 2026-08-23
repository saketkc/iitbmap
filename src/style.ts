import type {
  ExpressionSpecification,
  FillLayerSpecification,
  LineLayerSpecification,
  Map as MaplibreMap,
  StyleSpecification,
} from "maplibre-gl";
import { CAMPUS_BBOX, MAP_BG, MAP_BG_DARK, MAX_ZOOM, MIN_ZOOM } from "./geo";
import { BUILDING_LABEL_LAYER_ID, buildingLabelLayer, BUILDINGS_SOURCE_ID, IITB_BUILDINGS } from "./buildings";
import { DEFAULT_GLYPHS_URL, DEFAULT_TILE_URL } from "./config";

export const CAMPUS_SOURCE_ID = "campus";

export const ATTRIBUTION =
  '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors · ' +
  'basemap style adapted from <a href="https://github.com/marceloprates/prettymaps">prettymaps</a>';

const PALETTE = {
  light: { green: "#7cb069", parking: "#a8a29e", building: "#57534e", water: "#5b9bd5", line: "#44403c" },
  dark: { green: "#7fb85f", parking: "#7d8291", building: "#c4b9ac", water: "#6cb4e8", line: "#d6d3d1" },
} as const;

const STREET_WEIGHT: ExpressionSpecification = [
  "match", ["get", "highway"],
  "motorway", 5, "trunk", 5, "primary", 4.5, "secondary", 4,
  "tertiary", 3.5, "cycleway", 3.5, "residential", 3,
  "service", 2, "unclassified", 2, "pedestrian", 2, "footway", 1,
  1.5,
];

const WATERWAY_WEIGHT: ExpressionSpecification = [
  "match", ["get", "waterway"],
  "river", 20, "stream", 10,
  10,
];

const zoomWidth = (weight: ExpressionSpecification, baseAtMinZoom: number): ExpressionSpecification => [
  "interpolate", ["linear"], ["zoom"],
  MIN_ZOOM, ["*", baseAtMinZoom, weight],
  MAX_ZOOM, ["*", baseAtMinZoom * 4, weight],
];

export function campusLayers(dark = false): (FillLayerSpecification | LineLayerSpecification)[] {
  const c = dark ? PALETTE.dark : PALETTE.light;
  return [
    {
      id: "campus-green", type: "fill", source: CAMPUS_SOURCE_ID, "source-layer": "green",
      paint: { "fill-color": c.green, "fill-outline-color": c.line },
    },
    {
      id: "campus-parking", type: "fill", source: CAMPUS_SOURCE_ID, "source-layer": "parking",
      paint: { "fill-color": c.parking, "fill-outline-color": c.line },
    },
    {
      id: "campus-streets", type: "line", source: CAMPUS_SOURCE_ID, "source-layer": "streets",
      paint: { "line-color": c.line, "line-width": zoomWidth(STREET_WEIGHT, 0.3) },
    },
    {
      id: "campus-building", type: "fill", source: CAMPUS_SOURCE_ID, "source-layer": "building",
      paint: { "fill-color": c.building, "fill-outline-color": c.line, "fill-opacity": 0.9 },
    },
    {
      id: "campus-water", type: "fill", source: CAMPUS_SOURCE_ID, "source-layer": "water",
      paint: { "fill-color": c.water, "fill-outline-color": c.line },
    },
    {
      id: "campus-waterway", type: "line", source: CAMPUS_SOURCE_ID, "source-layer": "waterway",
      paint: { "line-color": c.water, "line-width": zoomWidth(WATERWAY_WEIGHT, 0.15) },
    },
  ];
}

function resolveUrl(name: string, passed: string | undefined, fallback: string): string {
  const url = passed ?? fallback;
  if (!url) {
    throw new Error(
      `iitbmap: no ${name} configured. Pass it explicitly to getCampusStyle()/mergeCampusLayers() ` +
        `(the package's default is unset until the R2-hosted copy is live, see the README).`,
    );
  }
  return url;
}

export interface CampusStyleOptions {
  dark?: boolean;
  tileUrl?: string;
  glyphsUrl?: string;
}

export function getCampusStyle(opts: CampusStyleOptions = {}): StyleSpecification {
  const dark = opts.dark ?? false;
  return {
    version: 8,
    glyphs: resolveUrl("glyphsUrl", opts.glyphsUrl, DEFAULT_GLYPHS_URL),
    sources: {
      [CAMPUS_SOURCE_ID]: {
        type: "vector",
        tiles: [resolveUrl("tileUrl", opts.tileUrl, DEFAULT_TILE_URL)],
        minzoom: MIN_ZOOM,
        maxzoom: MAX_ZOOM,
        bounds: [CAMPUS_BBOX.lngMin, CAMPUS_BBOX.latMin, CAMPUS_BBOX.lngMax, CAMPUS_BBOX.latMax],
        attribution: ATTRIBUTION,
      },
      [BUILDINGS_SOURCE_ID]: { type: "geojson", data: IITB_BUILDINGS },
    },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": dark ? MAP_BG_DARK : MAP_BG } },
      ...campusLayers(dark),
      buildingLabelLayer({ dark }),
    ],
  };
}

export interface MergeCampusLayersOptions {
  dark?: boolean;
  sourceId?: string;
  beforeId?: string;
  tileUrl?: string;
  glyphsUrl?: string;
}

export function mergeCampusLayers(style: StyleSpecification, opts: MergeCampusLayersOptions = {}): StyleSpecification {
  const sourceId = opts.sourceId ?? CAMPUS_SOURCE_ID;
  if (style.sources[sourceId]) {
    throw new Error(`iitbmap: mergeCampusLayers: style already has a source named "${sourceId}"`);
  }
  const layers = campusLayers(opts.dark ?? false).map((layer) =>
    sourceId === CAMPUS_SOURCE_ID ? layer : { ...layer, source: sourceId },
  );
  const insertAt = opts.beforeId ? style.layers.findIndex((l) => l.id === opts.beforeId) : -1;
  const newLayers =
    insertAt === -1
      ? [...style.layers, ...layers]
      : [...style.layers.slice(0, insertAt), ...layers, ...style.layers.slice(insertAt)];
  return {
    ...style,
    sources: {
      ...style.sources,
      [sourceId]: {
        type: "vector",
        tiles: [resolveUrl("tileUrl", opts.tileUrl, DEFAULT_TILE_URL)],
        minzoom: MIN_ZOOM,
        maxzoom: MAX_ZOOM,
        attribution: ATTRIBUTION,
      },
    },
    layers: newLayers,
  };
}

export function setCampusTheme(map: MaplibreMap, dark: boolean): void {
  if (map.getLayer("bg")) map.setPaintProperty("bg", "background-color", dark ? MAP_BG_DARK : MAP_BG);
  for (const layer of campusLayers(dark)) {
    if (!map.getLayer(layer.id)) continue;
    for (const [prop, value] of Object.entries(layer.paint ?? {})) {
      map.setPaintProperty(layer.id, prop, value);
    }
  }
  if (map.getLayer(BUILDING_LABEL_LAYER_ID)) {
    const { paint } = buildingLabelLayer({ dark });
    for (const [prop, value] of Object.entries(paint ?? {})) {
      map.setPaintProperty(BUILDING_LABEL_LAYER_ID, prop, value);
    }
  }
}

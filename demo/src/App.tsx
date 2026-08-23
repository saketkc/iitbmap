import * as React from "react";
import maplibregl from "maplibre-gl";
import type { Feature, Polygon } from "geojson";
import { ChevronsUpDown, MapPin } from "lucide-react";

import {
  getCampusStyle,
  setCampusTheme,
  CAMPUS_BOUNDS,
  CAMPUS_CENTER,
  MIN_ZOOM,
  MAX_ZOOM,
  setBuildingLabelsVisible,
  IITB_BUILDINGS,
  buildingCentroid,
  findRoutes,
  type Route,
  type RoutingProfile,
} from "../../src/index";
import { readSharedRoute, writeSharedRoute } from "@/lib/route-url";

import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BuildingCombobox } from "@/components/building-combobox";

const MY_LOCATION_LABEL = "My current location";
const ROUTE_SOURCE_ID = "demo-route";
const ROUTE_LAYER_ID = "demo-route-line";

const buildingNames = IITB_BUILDINGS.features
  .map((f) => f.properties?.name)
  .filter((name): name is string => !!name);

interface RouteState {
  routes: Route[];
  selectedIndex: number;
}

function findBuildingCentroid(name: string): [number, number] | undefined {
  const feature = IITB_BUILDINGS.features.find((f) => f.properties?.name?.toLowerCase() === name.trim().toLowerCase());
  return feature ? buildingCentroid(feature as Feature<Polygon>) : undefined;
}

function formatRouteInfo(route: Route, profile: RoutingProfile): string {
  const km = route.distanceMeters / 1000;
  const speedKmh = profile === "walk" ? 5 : 20;
  const minutes = Math.round((km / speedKmh) * 60);
  return `${km.toFixed(2)} km, ~${minutes} min ${profile === "walk" ? "walking" : "driving"}`;
}

function toErrorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function setMarker(map: maplibregl.Map, marker: maplibregl.Marker | null, coords: [number, number], color: string): maplibregl.Marker {
  if (marker) {
    marker.setLngLat(coords);
    return marker;
  }
  return new maplibregl.Marker({ color }).setLngLat(coords).addTo(map);
}

// map.setStyle() wipes custom sources/layers, so this is called from both the
// route-sync effect and the style.load handler (the tile/glyph-URL "Apply" path
// still rebuilds the whole style). Dark mode uses setCampusTheme() instead, which
// doesn't call setStyle(), so it doesn't need this.
function drawRouteLayer(map: maplibregl.Map, routes: Route[], selectedIndex: number) {
  const features = routes
    .map((route, i) => ({ route, selected: i === selectedIndex }))
    .sort((a, b) => Number(a.selected) - Number(b.selected))
    .map(
      ({ route, selected }): GeoJSON.Feature<GeoJSON.LineString> => ({
        type: "Feature",
        properties: { selected },
        geometry: { type: "LineString", coordinates: route.coordinates },
      }),
    );
  const data: GeoJSON.FeatureCollection<GeoJSON.LineString> = { type: "FeatureCollection", features };

  const source = map.getSource(ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource | undefined;
  if (source) {
    source.setData(data);
  } else {
    map.addSource(ROUTE_SOURCE_ID, { type: "geojson", data });
    map.addLayer({
      id: ROUTE_LAYER_ID,
      type: "line",
      source: ROUTE_SOURCE_ID,
      layout: { "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ["case", ["get", "selected"], "#2563eb", "#94a3b8"],
        "line-width": ["case", ["get", "selected"], 5, 3],
        "line-opacity": ["case", ["get", "selected"], 0.9, 0.6],
      },
    });
  }
}

function LabeledInput({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {label}
      </Label>
      <Input id={id} value={value} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export default function App() {
  const mapContainerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<maplibregl.Map | null>(null);
  const fromMarkerRef = React.useRef<maplibregl.Marker | null>(null);
  const toMarkerRef = React.useRef<maplibregl.Marker | null>(null);

  const [dark, setDark] = React.useState(false);
  const [buildingNamesVisible, setBuildingNamesVisible] = React.useState(true);
  const [tileUrlDraft, setTileUrlDraft] = React.useState(() =>
    import.meta.env.DEV ? `${window.location.origin}/tiles/{z}/{x}/{y}.pbf` : "",
  );
  const [glyphsUrlDraft, setGlyphsUrlDraft] = React.useState(() => (import.meta.env.DEV ? "/fonts/{fontstack}/{range}.pbf" : ""));

  const [fromValue, setFromValue] = React.useState("");
  const [toValue, setToValue] = React.useState("");
  const [myLocation, setMyLocation] = React.useState<[number, number] | null>(null);
  const [profile, setProfile] = React.useState<RoutingProfile>("walk");
  const [routeState, setRouteState] = React.useState<RouteState>({ routes: [], selectedIndex: 0 });
  const [error, setError] = React.useState("");

  const applyStyleOverrides = () => {
    const map = mapRef.current;
    if (!map) return;
    try {
      setError("");
      map.setStyle(getCampusStyle({ dark, tileUrl: tileUrlDraft || undefined, glyphsUrl: glyphsUrlDraft || undefined }));
    } catch (err) {
      setError(toErrorMessage(err));
    }
  };

  const pushRouteUrl = (routeIndex: number) => {
    const url = writeSharedRoute(new URL(window.location.href), {
      from: fromValue.trim(),
      to: toValue.trim(),
      profile,
      routeIndex,
    });
    window.history.pushState(null, "", url);
  };

  const computeRoute = (routeIndex: number, pushUrl: boolean) => {
    const map = mapRef.current;
    if (!map) return;
    setError("");

    const from = fromValue.trim() === MY_LOCATION_LABEL && myLocation ? myLocation : findBuildingCentroid(fromValue);
    const to = findBuildingCentroid(toValue);
    if (!from) {
      setError(`Unknown "from": ${fromValue}`);
      return;
    }
    if (!to) {
      setError(`Unknown "to": ${toValue}`);
      return;
    }

    const found = findRoutes(from, to, profile, 3);
    if (found.length === 0) {
      setRouteState((s) => ({ ...s, routes: [] }));
      setError("No route found between those two points.");
      return;
    }

    const nextIndex = Math.min(routeIndex, found.length - 1);
    setRouteState({ routes: found, selectedIndex: nextIndex });
    if (pushUrl) pushRouteUrl(nextIndex);

    fromMarkerRef.current = setMarker(map, fromMarkerRef.current, from, "#16a34a");
    toMarkerRef.current = setMarker(map, toMarkerRef.current, to, "#dc2626");

    const allCoords = found.flatMap((r) => r.coordinates);
    const bounds = allCoords.reduce(
      (b, c) => b.extend(c as [number, number]),
      new maplibregl.LngLatBounds(allCoords[0], allCoords[0]),
    );
    map.fitBounds(bounds, { padding: 48 });
  };

  // Two named entry points instead of one boolean-flag parameter: a fresh user-initiated
  // search always starts at route 0 and updates the URL; a recompute (after a style reload
  // or a shareable-URL restore) keeps whatever route was already selected and doesn't.
  const searchDirections = () => computeRoute(0, true);
  const recomputeRoute = () => computeRoute(routeState.selectedIndex, false);

  const clearRoute = () => {
    setRouteState({ routes: [], selectedIndex: 0 });
    fromMarkerRef.current?.remove();
    toMarkerRef.current?.remove();
    fromMarkerRef.current = null;
    toMarkerRef.current = null;
  };

  // Bridges into MapLibre's persistent `style.load` listener, which is registered once
  // and would otherwise only ever see the state from the render it was created in.
  const latest = { fromValue, toValue, routeState, buildingNamesVisible, recomputeRoute };
  const latestRef = React.useRef(latest);
  latestRef.current = latest;

  // Map creation: once on mount only.
  React.useEffect(() => {
    if (!mapContainerRef.current) return;
    let style;
    try {
      style = getCampusStyle({ dark: false, tileUrl: tileUrlDraft || undefined, glyphsUrl: glyphsUrlDraft || undefined });
    } catch (err) {
      setError(toErrorMessage(err));
      return;
    }

    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style,
      bounds: CAMPUS_BOUNDS,
      center: CAMPUS_CENTER,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
      fitBoundsOptions: { padding: 24 },
    });
    mapRef.current = map;

    // `setStyle()` replaces layers, so restore visibility/route on every load. A
    // URL-specified route (from/to populated, not yet resolved into routes) is
    // re-requested here rather than redrawn, since it hasn't been computed yet.
    map.on("style.load", () => {
      const current = latestRef.current;
      setBuildingLabelsVisible(map, current.buildingNamesVisible);
      if (current.fromValue.trim() && current.toValue.trim() && current.routeState.routes.length === 0) {
        current.recomputeRoute();
      } else if (current.routeState.routes.length > 0) {
        drawRouteLayer(map, current.routeState.routes, current.routeState.selectedIndex);
      }
    });
    map.on("error", (e) => {
      setError("Map error: " + (e.error?.message ?? String(e)));
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Route layer sync: the single place that draws `routeState` onto the map in response
  // to state changes. `style.load` separately redraws the same way after a style reload
  // (see above), since setStyle() wipes what this effect doesn't recreate on its own.
  React.useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    drawRouteLayer(map, routeState.routes, routeState.selectedIndex);
  }, [routeState]);

  // Shareable-URL restore on mount, plus keeping it in sync with back/forward navigation.
  React.useEffect(() => {
    function restoreFromUrl(): boolean {
      const shared = readSharedRoute(new URL(window.location.href));
      if (!shared) return false;
      setFromValue(shared.from);
      setToValue(shared.to);
      setProfile(shared.profile);
      setRouteState((s) => ({ ...s, selectedIndex: shared.routeIndex }));
      return true;
    }

    restoreFromUrl();

    function onPopState() {
      if (!restoreFromUrl()) {
        clearRoute();
        return;
      }
      const map = mapRef.current;
      if (map?.isStyleLoaded()) latestRef.current.recomputeRoute();
      // Otherwise the style.load handler picks up the now-populated from/to once the
      // map finishes (re)loading its style.
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Service worker registration, production only (avoids fighting Vite's dev HMR).
  React.useEffect(() => {
    if (!import.meta.env.DEV && "serviceWorker" in navigator) {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
    }
  }, []);

  function useMyLocation() {
    setError("");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setMyLocation([pos.coords.longitude, pos.coords.latitude]);
        setFromValue(MY_LOCATION_LABEL);
      },
      (err) => setError(`Geolocation failed: ${err.message}`),
    );
  }

  return (
    <>
      <Card
        className="absolute z-10 w-[300px] gap-3 overflow-y-auto p-3 shadow-lg"
        style={{
          top: "max(12px, env(safe-area-inset-top))",
          left: "max(12px, env(safe-area-inset-left))",
          maxHeight: "calc(100vh - max(24px, env(safe-area-inset-top) + env(safe-area-inset-bottom) + 24px))",
        }}
      >
        <CardContent className="flex flex-col gap-3 px-1">
          <div className="flex items-center gap-2">
            <Checkbox
              id="dark"
              checked={dark}
              onCheckedChange={(v) => {
                const next = v === true;
                setDark(next);
                const map = mapRef.current;
                if (map && map.isStyleLoaded()) setCampusTheme(map, next);
              }}
            />
            <Label htmlFor="dark">Dark mode</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="buildingNames"
              checked={buildingNamesVisible}
              onCheckedChange={(v) => {
                const next = v === true;
                setBuildingNamesVisible(next);
                const map = mapRef.current;
                if (map && map.isStyleLoaded()) setBuildingLabelsVisible(map, next);
              }}
            />
            <Label htmlFor="buildingNames">Building names</Label>
          </div>

          <Collapsible>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="w-full justify-between px-2 text-muted-foreground">
                Advanced
                <ChevronsUpDown className="size-3.5" />
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="flex flex-col gap-2 pt-2">
              <LabeledInput id="tileUrl" label="Tile URL template" value={tileUrlDraft} onChange={setTileUrlDraft} />
              <LabeledInput id="glyphsUrl" label="Glyphs URL template" value={glyphsUrlDraft} onChange={setGlyphsUrlDraft} />
            </CollapsibleContent>
          </Collapsible>
          <Button onClick={applyStyleOverrides}>Apply</Button>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Separator />

          <div className="flex gap-2">
            <BuildingCombobox
              id="fromInput"
              value={fromValue}
              onValueChange={setFromValue}
              buildingNames={buildingNames}
              placeholder="From (building or my location)"
              className="flex-1"
            />
            <Button variant="outline" size="icon" title="Use my current location" onClick={useMyLocation}>
              <MapPin className="size-4" />
            </Button>
          </div>
          <BuildingCombobox id="toInput" value={toValue} onValueChange={setToValue} buildingNames={buildingNames} placeholder="To (building)" />

          <ToggleGroup type="single" value={profile} onValueChange={(v) => v && setProfile(v as RoutingProfile)}>
            <ToggleGroupItem value="walk" className="flex-1">
              Walk
            </ToggleGroupItem>
            <ToggleGroupItem value="drive" className="flex-1">
              Drive
            </ToggleGroupItem>
          </ToggleGroup>

          <Button onClick={searchDirections}>Get directions</Button>

          {routeState.routes.length > 0 && (
            <ToggleGroup
              type="single"
              orientation="vertical"
              value={String(routeState.selectedIndex)}
              onValueChange={(v) => {
                if (!v) return;
                const i = Number(v);
                setRouteState((s) => ({ ...s, selectedIndex: i }));
                pushRouteUrl(i);
              }}
            >
              {routeState.routes.map((route, i) => (
                <ToggleGroupItem key={i} value={String(i)}>
                  {formatRouteInfo(route, profile)}
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          )}
        </CardContent>
      </Card>
      <div id="map" ref={mapContainerRef} />
    </>
  );
}

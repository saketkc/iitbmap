import * as React from "react";
import maplibregl from "maplibre-gl";
import { MapPin, Navigation, Settings, Share2, X } from "lucide-react";

import {
  getCampusStyle,
  setCampusTheme,
  CAMPUS_CENTER,
  MIN_ZOOM,
  MAX_ZOOM,
  setBuildingLabelsVisible,
  IITB_BUILDINGS,
  findRoutes,
  inCampusBbox,
  type Route,
  type RoutingProfile,
} from "../../src/index";
import { readSharedRoute, routeLink, writeSharedRoute, type SharedRoute } from "@/lib/route-url";
import { buildingPath, buildingSlug, slugFromPathname } from "@/lib/building-url";
import { encodeDigipin } from "@/lib/digipin";
import { MARKER_COLORS, MY_LOCATION_LABEL, findBuildingCentroid, formatRouteInfo, resolvePlace } from "@/lib/places";
import { haversineMeters } from "../../src/routing";

import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { BuildingCombobox } from "@/components/building-combobox";

const ROUTE_SOURCE_ID = "demo-route";
const ROUTE_LAYER_ID = "demo-route-line";

const buildingNames = IITB_BUILDINGS.features
  .map((f) => f.properties?.name)
  .filter((name): name is string => !!name);

// Opened via a /b/<slug>/ share page: that building is the destination.
const sharedBuilding = (() => {
  const slug = slugFromPathname(window.location.pathname);
  return slug ? buildingNames.find((name) => buildingSlug(name) === slug) : undefined;
})();

interface RouteState {
  routes: Route[];
  selectedIndex: number;
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
        "line-color": ["case", ["get", "selected"], MARKER_COLORS.route, "#94a3b8"],
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

function DigipinHint({ label, place }: { label: string; place: [number, number] | null | undefined }) {
  if (!place) return null;
  return (
    <p className="-mt-1 px-1 text-xs text-muted-foreground">
      {label} · DIGIPIN <span className="font-mono select-all">{encodeDigipin(place)}</span>
    </p>
  );
}

// panel starts open and routes fit beside it from this width up
const WIDE_SCREEN = "(min-width: 640px)";
const FIT_PADDING = 48;

export default function App() {
  const mapContainerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<maplibregl.Map | null>(null);
  const panelRef = React.useRef<HTMLDivElement>(null);
  // isStyleLoaded() stays false until every tile loads
  const styleReadyRef = React.useRef(false);
  const fromMarkerRef = React.useRef<maplibregl.Marker | null>(null);
  const toMarkerRef = React.useRef<maplibregl.Marker | null>(null);
  const geolocateRef = React.useRef<maplibregl.GeolocateControl | null>(null);
  const lastRoutedFixRef = React.useRef<{ at: [number, number]; to: string } | null>(null);

  const [dark, setDark] = React.useState(false);
  const [buildingNamesVisible, setBuildingNamesVisible] = React.useState(true);
  const [tileUrlDraft, setTileUrlDraft] = React.useState(() =>
    import.meta.env.DEV ? `${window.location.origin}/tiles/{z}/{x}/{y}.pbf` : "",
  );
  const [glyphsUrlDraft, setGlyphsUrlDraft] = React.useState(() => (import.meta.env.DEV ? "/fonts/{fontstack}/{range}.pbf" : ""));

  const [fromValue, setFromValue] = React.useState("");
  const [toValue, setToValue] = React.useState(sharedBuilding ?? "");
  const [myLocation, setMyLocation] = React.useState<[number, number] | null>(null);
  const [profile, setProfile] = React.useState<RoutingProfile>("walk");
  const [routeState, setRouteState] = React.useState<RouteState>({ routes: [], selectedIndex: 0 });
  const [error, setError] = React.useState("");
  const [linkCopied, setLinkCopied] = React.useState(false);
  const [settingsOpen, setSettingsOpen] = React.useState(false);
  const [directions, setDirections] = React.useState(false);

  const applyStyleOverrides = () => {
    const map = mapRef.current;
    if (!map) return;
    try {
      setError("");
      const style = getCampusStyle({ dark, tileUrl: tileUrlDraft || undefined, glyphsUrl: glyphsUrlDraft || undefined });
      styleReadyRef.current = false;
      // a diffed setStyle skips style.load, which redraws the route
      map.setStyle(style, { diff: false });
    } catch (err) {
      setError(toErrorMessage(err));
    }
  };

  const fromIsMe = fromValue.trim() === MY_LOCATION_LABEL;
  const toPlace = resolvePlace(toValue);
  const appBase = new URL(import.meta.env.BASE_URL, window.location.origin);
  const sharedRoute = (routeIndex: number): SharedRoute => ({ from: fromValue.trim(), to: toValue.trim(), profile, routeIndex });

  const pushRouteUrl = (routeIndex: number) => {
    window.history.pushState(null, "", routeLink(appBase, sharedRoute(routeIndex)));
  };

  // route links use the share Worker when configured, so the preview shows the route
  const shareUrl = () => {
    const worker = import.meta.env.VITE_SHARE_URL;
    if (routeState.routes.length === 0) {
      return findBuildingCentroid(toValue) ? new URL(buildingPath(toValue.trim()), appBase).href : appBase.href;
    }
    const route = sharedRoute(routeState.selectedIndex);
    return (worker ? writeSharedRoute(new URL("r", worker), route) : routeLink(appBase, route)).href;
  };

  const shareLink = async () => {
    const url = shareUrl();
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch (err) {
      setError(`Couldn't share: ${toErrorMessage(err)}`);
    }
  };

  const computeRoute = (routeIndex: number, { pushUrl, fit }: { pushUrl: boolean; fit: boolean }) => {
    const map = mapRef.current;
    if (!map) return;
    setError("");

    const from = fromIsMe ? myLocation : resolvePlace(fromValue);
    const to = toPlace;
    if (!from) {
      setError(fromIsMe ? "Waiting for your location…" : `Unknown "from": ${fromValue}`);
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

    fromMarkerRef.current = setMarker(map, fromMarkerRef.current, from, MARKER_COLORS.start);
    toMarkerRef.current = setMarker(map, toMarkerRef.current, to, MARKER_COLORS.end);

    if (!fit) return;
    const allCoords = found.flatMap((r) => r.coordinates);
    const bounds = allCoords.reduce(
      (b, c) => b.extend(c as [number, number]),
      new maplibregl.LngLatBounds(allCoords[0], allCoords[0]),
    );
    const panelRight = window.matchMedia(WIDE_SCREEN).matches ? (panelRef.current?.getBoundingClientRect().right ?? 0) : 0;
    map.fitBounds(bounds, { padding: { top: FIT_PADDING, right: FIT_PADDING, bottom: FIT_PADDING, left: panelRight + FIT_PADDING } });
  };

  // Two named entry points instead of one boolean-flag parameter: a fresh user-initiated
  // search always starts at route 0 and updates the URL; a recompute (after a style reload
  // or a shareable-URL restore) keeps whatever route was already selected and doesn't.
  const searchDirections = () => computeRoute(0, { pushUrl: true, fit: true });
  const recomputeRoute = () => computeRoute(routeState.selectedIndex, { pushUrl: false, fit: true });

  const clearRoute = () => {
    setRouteState({ routes: [], selectedIndex: 0 });
    fromMarkerRef.current?.remove();
    toMarkerRef.current?.remove();
    fromMarkerRef.current = null;
    toMarkerRef.current = null;
  };

  // clear From too, or style.load re-routes
  const exitDirections = () => {
    setDirections(false);
    setFromValue("");
    clearRoute();
  };

  // Bridges into MapLibre's persistent `style.load` listener, which is registered once
  // and would otherwise only ever see the state from the render it was created in.
  const latest = { fromValue, toValue, routeState, buildingNamesVisible, recomputeRoute };
  const latestRef = React.useRef(latest);
  latestRef.current = latest;

  React.useEffect(() => {
    if (!mapContainerRef.current) return;
    let style;
    try {
      style = getCampusStyle({ dark: false, tileUrl: tileUrlDraft || undefined, glyphsUrl: glyphsUrlDraft || undefined });
    } catch (err) {
      setError(toErrorMessage(err));
      return;
    }

    const sharedCentroid = sharedBuilding ? findBuildingCentroid(sharedBuilding) : undefined;
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style,
      center: sharedCentroid ?? CAMPUS_CENTER,
      zoom: sharedCentroid ? 17 : 16,
      minZoom: MIN_ZOOM,
      maxZoom: MAX_ZOOM,
    });
    mapRef.current = map;
    if (sharedCentroid) toMarkerRef.current = setMarker(map, null, sharedCentroid, MARKER_COLORS.end);

    const geolocate = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
    });
    map.addControl(geolocate, "bottom-right");
    geolocate.on("geolocate", (pos: GeolocationPosition) => setMyLocation([pos.coords.longitude, pos.coords.latitude]));
    geolocateRef.current = geolocate;
    // Auto-track only on campus: off campus the camera would follow the user off the map.
    map.once("load", () => {
      navigator.geolocation?.getCurrentPosition(
        (pos) => {
          if (inCampusBbox(pos.coords.latitude, pos.coords.longitude)) geolocate.trigger();
        },
        () => {}, // denied/unavailable: the control's button still lets the user retry
        { enableHighAccuracy: true },
      );
    });

    // `setStyle()` replaces layers, so restore visibility/route on every load. A
    // URL-specified route (from/to populated, not yet resolved into routes) is
    // re-requested here rather than redrawn, since it hasn't been computed yet.
    map.on("style.load", () => {
      styleReadyRef.current = true;
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
    if (!map || !styleReadyRef.current) return;
    drawRouteLayer(map, routeState.routes, routeState.selectedIndex);
  }, [routeState]);

  React.useEffect(() => {
    function restoreFromUrl(): boolean {
      const shared = readSharedRoute(new URL(window.location.href));
      if (!shared) return false;
      setDirections(true);
      setFromValue(shared.from);
      setToValue(shared.to);
      setProfile(shared.profile);
      setRouteState((s) => ({ ...s, selectedIndex: shared.routeIndex }));
      return true;
    }

    restoreFromUrl();

    function onPopState() {
      if (!restoreFromUrl()) {
        exitDirections();
        return;
      }
      if (styleReadyRef.current) latestRef.current.recomputeRoute();
      // Otherwise the style.load handler picks up the now-populated from/to once the
      // map finishes (re)loading its style.
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // live directions from the GPS fix; only the first route fits the camera, so later fixes don't fight panning
  React.useEffect(() => {
    if (!directions || !myLocation || !inCampusBbox(myLocation[1], myLocation[0]) || !toPlace) return;
    if (!fromValue.trim()) {
      setFromValue(MY_LOCATION_LABEL);
      return;
    }
    if (!fromIsMe || !styleReadyRef.current) return;
    // skip GPS jitter; k-shortest-paths is too slow to rerun per fix
    const last = lastRoutedFixRef.current;
    if (routeState.routes.length > 0 && last?.to === toValue && haversineMeters(last.at, myLocation) < 10) return;
    lastRoutedFixRef.current = { at: myLocation, to: toValue };
    computeRoute(routeState.selectedIndex, { pushUrl: false, fit: routeState.routes.length === 0 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [directions, myLocation, fromValue, toValue]);

  // computeRoute owns the camera in directions mode
  React.useEffect(() => {
    const map = mapRef.current;
    if (directions || !map || !toPlace) return;
    toMarkerRef.current = setMarker(map, toMarkerRef.current, toPlace, MARKER_COLORS.end);
    map.flyTo({ center: toPlace, zoom: Math.max(map.getZoom(), 17) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toValue, directions]);

  // Service worker registration, production only (avoids fighting Vite's dev HMR).
  React.useEffect(() => {
    if (!import.meta.env.DEV && "serviceWorker" in navigator) {
      navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
    }
  }, []);

  function useMyLocation() {
    setError("");
    setFromValue(MY_LOCATION_LABEL);
    if (!myLocation) geolocateRef.current?.trigger();
  }

  return (
    <>
      <Card
        ref={panelRef}
        className="absolute z-10 w-[min(320px,calc(100vw-24px))] gap-0 overflow-y-auto p-3 shadow-lg"
        style={{
          top: "max(12px, env(safe-area-inset-top))",
          left: "max(12px, env(safe-area-inset-left))",
          maxHeight: "calc(100vh - max(24px, env(safe-area-inset-top) + env(safe-area-inset-bottom) + 24px))",
        }}
      >
        <CardContent className="flex flex-col gap-3 p-0">
          {directions && (
            <div className="flex items-center gap-2">
              <BuildingCombobox
                id="fromInput"
                value={fromValue}
                onValueChange={setFromValue}
                buildingNames={buildingNames}
                placeholder="From (building, DIGIPIN, my location)"
                className="flex-1"
              />
              <Button
                variant="outline"
                size="icon"
                title="Use my current location"
                aria-label="Use my current location"
                onClick={useMyLocation}
              >
                <MapPin className="size-4" />
              </Button>
            </div>
          )}
          <div className="flex items-center gap-2">
            <BuildingCombobox
              id="toInput"
              value={toValue}
              onValueChange={setToValue}
              buildingNames={buildingNames}
              placeholder={directions ? "To (building or DIGIPIN)" : "Search buildings"}
              className="flex-1"
            />
            <Button
              variant="ghost"
              size="icon"
              title="Settings"
              aria-label="Settings"
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen((o) => !o)}
            >
              <Settings className="size-4" />
            </Button>
          </div>

          <DigipinHint label="To" place={toPlace} />
          {directions && (
            <>
              {fromIsMe && <DigipinHint label="You" place={myLocation} />}
              <ToggleGroup type="single" value={profile} onValueChange={(v) => v && setProfile(v as RoutingProfile)}>
                <ToggleGroupItem value="walk" className="flex-1">
                  Walk
                </ToggleGroupItem>
                <ToggleGroupItem value="drive" className="flex-1">
                  Drive
                </ToggleGroupItem>
              </ToggleGroup>
            </>
          )}

          <div className="flex gap-2">
            {directions ? (
              <Button className="flex-1" onClick={searchDirections}>
                Get directions
              </Button>
            ) : (
              <Button className="flex-1" onClick={() => setDirections(true)} disabled={!toPlace}>
                <Navigation className="size-4" />
                Directions
              </Button>
            )}
            <Button variant="outline" onClick={shareLink} disabled={!toPlace}>
              <Share2 className="size-4" />
              {linkCopied ? "Link copied" : "Share"}
            </Button>
            {directions && (
              <Button variant="ghost" size="icon" title="Close directions" aria-label="Close directions" onClick={exitDirections}>
                <X className="size-4" />
              </Button>
            )}
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

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

          {settingsOpen && (
            <>
              <Separator />
              <div className="flex items-center gap-2">
                <Checkbox
                  id="dark"
                  checked={dark}
                  onCheckedChange={(v) => {
                    const next = v === true;
                    setDark(next);
                    document.documentElement.classList.toggle("dark", next);
                    const map = mapRef.current;
                    if (map && styleReadyRef.current) setCampusTheme(map, next);
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
                    if (map && styleReadyRef.current) setBuildingLabelsVisible(map, next);
                  }}
                />
                <Label htmlFor="buildingNames">Building names</Label>
              </div>
              <LabeledInput id="tileUrl" label="Tile URL template" value={tileUrlDraft} onChange={setTileUrlDraft} />
              <LabeledInput id="glyphsUrl" label="Glyphs URL template" value={glyphsUrlDraft} onChange={setGlyphsUrlDraft} />
              <Button onClick={applyStyleOverrides}>Apply</Button>
            </>
          )}
        </CardContent>
      </Card>
      <div id="map" ref={mapContainerRef} />
    </>
  );
}

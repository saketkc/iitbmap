/// <reference types="vite/client" />
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, Polygon } from "geojson";
import {
  getCampusStyle,
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
} from "../src/index";
import { readSharedRoute, writeSharedRoute } from "./route-url";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const darkInput = $<HTMLInputElement>("dark");
const buildingNamesInput = $<HTMLInputElement>("buildingNames");
const tileUrlInput = $<HTMLInputElement>("tileUrl");
const glyphsUrlInput = $<HTMLInputElement>("glyphsUrl");
const errorEl = $<HTMLDivElement>("error");
const fromInput = $<HTMLInputElement>("fromInput");
const toInput = $<HTMLInputElement>("toInput");
const routeInfoEl = $<HTMLDivElement>("routeInfo");

const MY_LOCATION_LABEL = "My current location";
let myLocation: [number, number] | null = null;

const buildingNames = IITB_BUILDINGS.features
  .map((f) => f.properties?.name)
  .filter((name): name is string => !!name);

function findBuildingCentroid(name: string): [number, number] | undefined {
  const feature = IITB_BUILDINGS.features.find(
    (f) => f.properties?.name?.toLowerCase() === name.trim().toLowerCase(),
  );
  return feature ? buildingCentroid(feature as Feature<Polygon>) : undefined;
}

function highlightMatch(name: string, query: string): string {
  const escape = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);
  const i = name.toLowerCase().indexOf(query.toLowerCase());
  if (i === -1) return escape(name);
  return `${escape(name.slice(0, i))}<mark>${escape(name.slice(i, i + query.length))}</mark>${escape(name.slice(i + query.length))}`;
}

function setupCombobox(input: HTMLInputElement, list: HTMLUListElement, names: string[]) {
  let visible: string[] = [];
  let activeIndex = -1;

  function close() {
    list.hidden = true;
    input.setAttribute("aria-expanded", "false");
    input.removeAttribute("aria-activedescendant");
    activeIndex = -1;
  }

  function setActive(index: number) {
    const options = list.querySelectorAll<HTMLLIElement>(".combobox-option");
    options.forEach((o) => o.classList.remove("active"));
    activeIndex = index;
    const option = options[index];
    if (option) {
      option.classList.add("active");
      option.scrollIntoView({ block: "nearest" });
      input.setAttribute("aria-activedescendant", option.id);
    } else {
      input.removeAttribute("aria-activedescendant");
    }
  }

  function select(name: string) {
    input.value = name;
    close();
  }

  function open(query: string) {
    const q = query.trim().toLowerCase();
    visible = q ? names.filter((n) => n.toLowerCase().includes(q)).slice(0, 8) : [];
    activeIndex = -1;
    list.innerHTML = "";
    if (visible.length === 0) {
      close();
      return;
    }
    visible.forEach((name, i) => {
      const li = document.createElement("li");
      li.id = `${list.id}-opt-${i}`;
      li.className = "combobox-option";
      li.setAttribute("role", "option");
      li.innerHTML = highlightMatch(name, query);
      // mousedown (not click) fires before the input's blur, so selection isn't lost.
      li.addEventListener("mousedown", (e) => {
        e.preventDefault();
        select(name);
      });
      list.appendChild(li);
    });
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
  }

  input.addEventListener("input", () => open(input.value));
  input.addEventListener("blur", close);
  input.addEventListener("keydown", (e) => {
    if (list.hidden) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive(Math.min(activeIndex + 1, visible.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive(Math.max(activeIndex - 1, 0));
    } else if (e.key === "Enter" && activeIndex >= 0) {
      e.preventDefault();
      select(visible[activeIndex]);
    } else if (e.key === "Escape") {
      close();
    }
  });
}

setupCombobox(fromInput, $<HTMLUListElement>("fromList"), buildingNames);
setupCombobox(toInput, $<HTMLUListElement>("toList"), buildingNames);

if (import.meta.env.DEV) {
  tileUrlInput.value = `${window.location.origin}/tiles/{z}/{x}/{y}.pbf`;
  glyphsUrlInput.value = "/fonts/{fontstack}/{range}.pbf";
}

let map: maplibregl.Map | undefined;
let lastRoutes: Route[] = [];
let selectedRouteIndex = 0;
let fromMarker: maplibregl.Marker | undefined;
let toMarker: maplibregl.Marker | undefined;
let routePendingAfterStyleLoad = false;

function applyBuildingNamesVisibility() {
  if (map) setBuildingLabelsVisible(map, buildingNamesInput.checked);
}

const ROUTE_SOURCE_ID = "demo-route";
const ROUTE_LAYER_ID = "demo-route-line";

function applyRouteLayer() {
  if (!map || lastRoutes.length === 0) return;
  const features = lastRoutes
    .map((route, i) => ({ route, selected: i === selectedRouteIndex }))
    .sort((a, b) => Number(a.selected) - Number(b.selected))
    .map(
      ({ route, selected }): GeoJSON.Feature<GeoJSON.LineString> => ({
        type: "Feature",
        properties: { selected },
        geometry: { type: "LineString", coordinates: route.coordinates },
      }),
    );
  const data: GeoJSON.FeatureCollection<GeoJSON.LineString> = { type: "FeatureCollection", features };

  if (map.getSource(ROUTE_SOURCE_ID)) {
    (map.getSource(ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource).setData(data);
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

function formatRouteInfo(route: Route, profile: RoutingProfile): string {
  const km = route.distanceMeters / 1000;
  const speedKmh = profile === "walk" ? 5 : 20;
  const minutes = Math.round((km / speedKmh) * 60);
  return `${km.toFixed(2)} km, ~${minutes} min ${profile === "walk" ? "walking" : "driving"}`;
}

function renderRouteList(profile: RoutingProfile) {
  routeInfoEl.innerHTML = "";
  lastRoutes.forEach((route, i) => {
    const option = document.createElement("button");
    option.type = "button";
    option.textContent = `${i === selectedRouteIndex ? "● " : "○ "}${formatRouteInfo(route, profile)}`;
    option.addEventListener("click", () => {
      selectedRouteIndex = i;
      applyRouteLayer();
      renderRouteList(profile);
      updateRouteUrl();
    });
    routeInfoEl.appendChild(option);
  });
}

function selectedProfile(): RoutingProfile {
  return (document.querySelector('input[name="profile"]:checked') as HTMLInputElement).value as RoutingProfile;
}

function updateRouteUrl() {
  const url = writeSharedRoute(new URL(window.location.href), {
    from: fromInput.value.trim(),
    to: toInput.value.trim(),
    profile: selectedProfile(),
    routeIndex: selectedRouteIndex,
  });
  window.history.pushState(null, "", url);
}

function loadDirectionsFromUrl(): boolean {
  const route = readSharedRoute(new URL(window.location.href));
  if (!route) return false;

  fromInput.value = route.from;
  toInput.value = route.to;
  document.querySelector<HTMLInputElement>(`input[name="profile"][value="${route.profile}"]`)!.checked = true;
  selectedRouteIndex = route.routeIndex;
  return true;
}

function getDirections(updateUrl = true) {
  if (!map) return;
  if (updateUrl) selectedRouteIndex = 0;
  routeInfoEl.innerHTML = "";
  errorEl.textContent = "";

  const from = fromInput.value.trim() === MY_LOCATION_LABEL && myLocation ? myLocation : findBuildingCentroid(fromInput.value);
  const to = findBuildingCentroid(toInput.value);
  if (!from) {
    errorEl.textContent = `Unknown "from": ${fromInput.value}`;
    return;
  }
  if (!to) {
    errorEl.textContent = `Unknown "to": ${toInput.value}`;
    return;
  }

  const profile = selectedProfile();
  const routes = findRoutes(from, to, profile, 3);
  if (routes.length === 0) {
    lastRoutes = [];
    errorEl.textContent = "No route found between those two points.";
    return;
  }

  lastRoutes = routes;
  selectedRouteIndex = Math.min(selectedRouteIndex, routes.length - 1);
  applyRouteLayer();
  renderRouteList(profile);
  if (updateUrl) updateRouteUrl();

  fromMarker?.remove();
  toMarker?.remove();
  fromMarker = new maplibregl.Marker({ color: "#16a34a" }).setLngLat(from).addTo(map);
  toMarker = new maplibregl.Marker({ color: "#dc2626" }).setLngLat(to).addTo(map);

  const allCoords = routes.flatMap((r) => r.coordinates);
  const bounds = allCoords.reduce(
    (b, c) => b.extend(c as [number, number]),
    new maplibregl.LngLatBounds(allCoords[0], allCoords[0]),
  );
  map.fitBounds(bounds, { padding: 48 });
}

function render() {
  errorEl.textContent = "";
  try {
    const style = getCampusStyle({
      dark: darkInput.checked,
      tileUrl: tileUrlInput.value || undefined,
      glyphsUrl: glyphsUrlInput.value || undefined,
    });
    if (map) {
      map.setStyle(style);
    } else {
      map = new maplibregl.Map({
        container: "map",
        style,
        bounds: CAMPUS_BOUNDS,
        center: CAMPUS_CENTER,
        minZoom: MIN_ZOOM,
        maxZoom: MAX_ZOOM,
        fitBoundsOptions: { padding: 24 },
      });
      // `setStyle()` replaces layers, so restore the checkbox state and route on every load.
      map.on("style.load", () => {
        applyBuildingNamesVisibility();
        if (routePendingAfterStyleLoad) {
          routePendingAfterStyleLoad = false;
          getDirections(false);
        } else {
          applyRouteLayer();
        }
      });
      map.on("error", (e) => {
        errorEl.textContent = "Map error: " + (e.error?.message ?? String(e));
      });
    }
  } catch (err) {
    errorEl.textContent = err instanceof Error ? err.message : String(err);
  }
}

$("apply").addEventListener("click", render);
darkInput.addEventListener("change", render);
buildingNamesInput.addEventListener("change", applyBuildingNamesVisibility);

$("useLocation").addEventListener("click", () => {
  errorEl.textContent = "";
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      myLocation = [pos.coords.longitude, pos.coords.latitude];
      fromInput.value = MY_LOCATION_LABEL;
    },
    (err) => {
      errorEl.textContent = `Geolocation failed: ${err.message}`;
    },
  );
});
$("getDirections").addEventListener("click", () => getDirections());

window.addEventListener("popstate", () => {
  if (!loadDirectionsFromUrl()) {
    lastRoutes = [];
    routeInfoEl.innerHTML = "";
    if (map?.getSource(ROUTE_SOURCE_ID)) {
      (map.getSource(ROUTE_SOURCE_ID) as maplibregl.GeoJSONSource).setData({
        type: "FeatureCollection",
        features: [],
      });
    }
    fromMarker?.remove();
    toMarker?.remove();
    return;
  }
  if (map?.isStyleLoaded()) getDirections(false);
  else routePendingAfterStyleLoad = true;
});

routePendingAfterStyleLoad = loadDirectionsFromUrl();

render();

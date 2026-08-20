import graphs from "./campus-routing.json";

export type RoutingProfile = "walk" | "drive";

export interface Route {
  coordinates: [number, number][];
  distanceMeters: number;
}

interface ProfileGraph {
  nodes: [number, number][];
  edges: [number, number, number][];
}

const RAW_GRAPHS = graphs as Record<RoutingProfile, ProfileGraph>;

function haversineMeters(a: [number, number], b: [number, number]): number {
  const R = 6371000;
  const [lng1, lat1] = a;
  const [lng2, lat2] = b;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

interface Adjacency {
  nodes: [number, number][];
  neighbors: { to: number; weight: number }[][];
}

const adjacencyCache = new Map<RoutingProfile, Adjacency>();

function getAdjacency(profile: RoutingProfile): Adjacency {
  let adjacency = adjacencyCache.get(profile);
  if (adjacency) return adjacency;

  const graph = RAW_GRAPHS[profile];
  const neighbors: { to: number; weight: number }[][] = graph.nodes.map(() => []);
  for (const [u, v, weight] of graph.edges) {
    neighbors[u].push({ to: v, weight });
    if (profile === "walk") neighbors[v].push({ to: u, weight });
  }
  adjacency = { nodes: graph.nodes, neighbors };
  adjacencyCache.set(profile, adjacency);
  return adjacency;
}

function nearestNode(nodes: [number, number][], point: [number, number]): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const d = haversineMeters(nodes[i], point);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  }
  return best;
}

interface PathResult {
  path: number[];
  distance: number;
}

// ponytail: O(V^2) scan instead of a binary heap; fine at a few hundred nodes.
function dijkstra(
  adjacency: Adjacency,
  source: number,
  target: number,
  excludedEdges?: Set<string>,
  excludedNodes?: Set<number>,
): PathResult | null {
  const { neighbors } = adjacency;
  const dist = new Array(neighbors.length).fill(Infinity);
  const prev = new Array(neighbors.length).fill(-1);
  const visited = new Array(neighbors.length).fill(false);
  dist[source] = 0;

  for (let iter = 0; iter < neighbors.length; iter++) {
    let u = -1;
    let best = Infinity;
    for (let i = 0; i < neighbors.length; i++) {
      if (!visited[i] && dist[i] < best) {
        best = dist[i];
        u = i;
      }
    }
    if (u === -1 || u === target) break;
    visited[u] = true;
    for (const { to, weight } of neighbors[u]) {
      if (excludedNodes?.has(to) || excludedEdges?.has(`${u}-${to}`)) continue;
      const alt = dist[u] + weight;
      if (alt < dist[to]) {
        dist[to] = alt;
        prev[to] = u;
      }
    }
  }

  if (dist[target] === Infinity) return null;
  const path: number[] = [];
  for (let at = target; at !== -1; at = prev[at]) path.push(at);
  path.reverse();
  return { path, distance: dist[target] };
}

function pathDistance(adjacency: Adjacency, path: number[]): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const edge = adjacency.neighbors[path[i - 1]].find((n) => n.to === path[i]);
    total += edge?.weight ?? 0;
  }
  return total;
}

function sameRoot(path: number[], root: number[]): boolean {
  return root.every((node, i) => path[i] === node);
}

function kShortestPaths(adjacency: Adjacency, source: number, target: number, k: number): PathResult[] {
  const first = dijkstra(adjacency, source, target);
  if (!first) return [];
  const found: PathResult[] = [first];
  const candidates: PathResult[] = [];

  for (let i = 1; i < k; i++) {
    const prevPath = found[i - 1].path;
    for (let spurIndex = 0; spurIndex < prevPath.length - 1; spurIndex++) {
      const spurNode = prevPath[spurIndex];
      const rootPath = prevPath.slice(0, spurIndex + 1);

      const excludedEdges = new Set<string>();
      for (const p of found) {
        if (p.path.length > spurIndex && sameRoot(p.path, rootPath)) {
          excludedEdges.add(`${p.path[spurIndex]}-${p.path[spurIndex + 1]}`);
        }
      }
      const excludedNodes = new Set(rootPath.slice(0, -1));

      const spur = dijkstra(adjacency, spurNode, target, excludedEdges, excludedNodes);
      if (!spur) continue;

      const totalPath = [...rootPath.slice(0, -1), ...spur.path];
      const totalDistance = pathDistance(adjacency, rootPath) + spur.distance;
      const isDuplicate =
        candidates.some((c) => sameRoot(c.path, totalPath) && c.path.length === totalPath.length) ||
        found.some((f) => sameRoot(f.path, totalPath) && f.path.length === totalPath.length);
      if (!isDuplicate) candidates.push({ path: totalPath, distance: totalDistance });
    }

    if (candidates.length === 0) break;
    candidates.sort((a, b) => a.distance - b.distance);
    found.push(candidates.shift()!);
  }

  return found;
}

function toRoute(adjacency: Adjacency, result: PathResult, from: [number, number], to: [number, number]): Route {
  const coordinates = result.path.map((i) => adjacency.nodes[i]);
  let distanceMeters = haversineMeters(from, coordinates[0]);
  for (let i = 1; i < coordinates.length; i++) {
    distanceMeters += haversineMeters(coordinates[i - 1], coordinates[i]);
  }
  distanceMeters += haversineMeters(coordinates[coordinates.length - 1], to);
  return { coordinates: [from, ...coordinates, to], distanceMeters };
}

export function findRoute(from: [number, number], to: [number, number], profile: RoutingProfile = "walk"): Route | null {
  return findRoutes(from, to, profile, 1)[0] ?? null;
}

export function findRoutes(
  from: [number, number],
  to: [number, number],
  profile: RoutingProfile = "walk",
  k = 3,
): Route[] {
  const adjacency = getAdjacency(profile);
  const sourceNode = nearestNode(adjacency.nodes, from);
  const targetNode = nearestNode(adjacency.nodes, to);
  return kShortestPaths(adjacency, sourceNode, targetNode, k).map((r) => toRoute(adjacency, r, from, to));
}

import axios from 'axios';
import * as turf from '@turf/turf';

export type LatLon = {
  lat: number;
  lon: number;
};

export type OSMNode = {
  type: 'node';
  id: number;
  lat: number;
  lon: number;
  tags?: Record<string, string>;
};

export type OSMWay = {
  type: 'way';
  id: number;
  nodes: number[];
  center?: LatLon;
  tags?: Record<string, string>;
};

export type OSMRelationMember = {
  type: 'node' | 'way' | 'relation';
  ref: number;
  role?: string;
};

export type OSMRelation = {
  type: 'relation';
  id: number;
  members?: OSMRelationMember[];
  tags?: Record<string, string>;
};

type OSMElement = OSMNode | OSMWay | OSMRelation | any;

export type OverpassResponse = {
  elements: OSMElement[];
};

type OverpassClientOptions = {
  overpassEndpoints: string[];
  shortText: (value: unknown, max?: number) => string;
  writeDebugLog: (name: string, data: unknown) => void;
  parseJsonSafe: (text: string) => any;
  sleep: (ms: number) => Promise<unknown>;
};

export function createOverpassClient(options: OverpassClientOptions) {
  const { overpassEndpoints, shortText, writeDebugLog, parseJsonSafe, sleep } = options;

  function buildOverpassQuery(bbox: string) {
    return `
[out:json][timeout:180];
(
  relation["type"="route"]["route"~"^(hiking|foot|walking)$"]["name"](${bbox});
);
out body;
>;
out body qt;
`.trim();
  }

  async function postOverpass(
    query: string,
    label: string,
    requestOptions: {
      rounds?: number;
      timeoutMs?: number;
      endpointPauseMs?: number;
      roundPauseBaseMs?: number;
    } = {}
  ): Promise<OverpassResponse> {
    const payload = new URLSearchParams({ data: query }).toString();
    const rounds = requestOptions.rounds ?? 2;
    const timeoutMs = requestOptions.timeoutMs ?? 180000;
    const endpointPauseMs = requestOptions.endpointPauseMs ?? 4000;
    const roundPauseBaseMs = requestOptions.roundPauseBaseMs ?? 5000;
    let lastError: any = null;

    console.log(
      `[overpass] label=${label} queryLength=${query.length} payloadBytes=${Buffer.byteLength(payload)}`
    );

    for (let round = 1; round <= rounds; round++) {
      for (const endpoint of overpassEndpoints) {
        const startedAt = Date.now();

        try {
          console.log(`[overpass] round=${round} endpoint=${endpoint} label=${label}`);

          const response = await axios.post(endpoint, payload, {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded',
              'User-Agent': 'trailfinder-collector/ts-monorepo',
              Accept: 'application/json,text/plain,*/*',
            },
            timeout: timeoutMs,
            responseType: 'text',
            transformResponse: [(data) => data],
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
            validateStatus: () => true,
          });

          const durationMs = Date.now() - startedAt;
          console.log(
            `[overpass] endpoint=${endpoint} status=${response.status} durationMs=${durationMs} label=${label}`
          );

          if (response.status < 200 || response.status >= 300) {
            const bodyPreview = shortText(response.data, 3000);
            writeDebugLog('overpass-http-error', {
              endpoint,
              status: response.status,
              label,
              bodyPreview,
            });
            lastError = new Error(`HTTP ${response.status} from ${endpoint}`);
            continue;
          }

          const parsed = parseJsonSafe(response.data);
          if (!parsed || !Array.isArray(parsed.elements)) {
            writeDebugLog('overpass-invalid-json', {
              endpoint,
              label,
              bodyPreview: shortText(response.data, 3000),
            });
            lastError = new Error(`Invalid Overpass JSON shape from ${endpoint}`);
            continue;
          }

          return parsed as OverpassResponse;
        } catch (error: any) {
          const durationMs = Date.now() - startedAt;
          writeDebugLog('overpass-request-error', {
            endpoint,
            label,
            message: error.message,
            code: error.code || null,
            durationMs,
            responseStatus: error.response?.status || null,
            responseBody: shortText(error.response?.data, 3000),
          });
          lastError = error;
        }

        await sleep(endpointPauseMs);
      }

      await sleep(round * roundPauseBaseMs);
    }

    throw lastError || new Error(`All Overpass endpoints failed for ${label}`);
  }

  return { buildOverpassQuery, postOverpass };
}

export function buildElementMaps(osm: OverpassResponse) {
  const nodes = new Map<number, OSMNode>();
  const ways = new Map<number, OSMWay>();
  const relations: OSMRelation[] = [];

  for (const el of osm.elements || []) {
    if (el.type === 'node' && typeof el.lat === 'number' && typeof el.lon === 'number') {
      nodes.set(el.id, el as OSMNode);
    } else if (el.type === 'way' && Array.isArray(el.nodes)) {
      ways.set(el.id, el as OSMWay);
    } else if (el.type === 'relation') {
      relations.push(el as OSMRelation);
    }
  }

  return { nodes, ways, relations };
}

export function isTrailRelation(relation: OSMRelation) {
  const tags = relation.tags || {};
  return (
    tags.type === 'route' &&
    (tags.route === 'hiking' || tags.route === 'foot' || tags.route === 'walking') &&
    !!tags.name
  );
}

export function buildGeometryFromRelation(
  relation: OSMRelation,
  waysMap: Map<number, OSMWay>,
  nodesMap: Map<number, OSMNode>
) {
  const lineParts: number[][][] = [];

  for (const member of relation.members || []) {
    if (member.type !== 'way') continue;
    const way = waysMap.get(member.ref);
    if (!way || !Array.isArray(way.nodes)) continue;

    const coords: number[][] = [];
    for (const nodeId of way.nodes) {
      const node = nodesMap.get(nodeId);
      if (node && typeof node.lon === 'number' && typeof node.lat === 'number') {
        coords.push([node.lon, node.lat]);
      }
    }

    if (coords.length >= 2) lineParts.push(coords);
  }

  if (!lineParts.length) return null;
  return { type: 'MultiLineString' as const, coordinates: lineParts };
}

export function getCentroid(geometry: { type: 'MultiLineString'; coordinates: number[][][] }) {
  try {
    const feature = { type: 'Feature' as const, properties: {}, geometry };
    const center = turf.centroid(feature);
    const [lon, lat] = center.geometry.coordinates;
    return { lat: Number(lat.toFixed(6)), lon: Number(lon.toFixed(6)) };
  } catch (error: any) {
    console.warn('[centroid] failed:', error.message);
    return null;
  }
}

export function getLengthKm(geometry: { type: 'MultiLineString'; coordinates: number[][][] }) {
  try {
    const feature = { type: 'Feature' as const, properties: {}, geometry };
    return Number(turf.length(feature, { units: 'kilometers' }).toFixed(2));
  } catch (error: any) {
    console.warn('[length] failed:', error.message);
    return null;
  }
}

export function getRepresentativeStartCoordinate(
  geometry: { type: 'MultiLineString'; coordinates: number[][][] } | null
) {
  if (!geometry || geometry.type !== 'MultiLineString' || !Array.isArray(geometry.coordinates)) {
    return null;
  }

  let bestCoords: number[][] | null = null;
  let bestLength = -1;

  for (const coords of geometry.coordinates) {
    if (!Array.isArray(coords) || coords.length < 2) continue;
    try {
      const len = turf.length(turf.lineString(coords), { units: 'kilometers' });
      if (len > bestLength) {
        bestLength = len;
        bestCoords = coords;
      }
    } catch {
      // ignore bad segment
    }
  }

  if (!bestCoords || !bestCoords.length) return null;
  const [lon, lat] = bestCoords[0];
  if (typeof lat !== 'number' || typeof lon !== 'number') return null;
  return { lat: Number(lat.toFixed(6)), lon: Number(lon.toFixed(6)) };
}

function getWayRepresentativeCoordinate(way: OSMWay, nodesMap: Map<number, OSMNode>) {
  if (!way || !Array.isArray(way.nodes) || !way.nodes.length) return null;

  const coords: number[][] = [];
  for (const nodeId of way.nodes) {
    const node = nodesMap.get(nodeId);
    if (node && typeof node.lat === 'number' && typeof node.lon === 'number') {
      coords.push([node.lon, node.lat]);
    }
  }
  if (!coords.length) return null;

  try {
    const center = turf.centroid(turf.lineString(coords));
    const [lon, lat] = center.geometry.coordinates;
    return { lat: Number(lat.toFixed(6)), lon: Number(lon.toFixed(6)) };
  } catch {
    const [lon, lat] = coords[Math.floor(coords.length / 2)];
    return { lat: Number(lat.toFixed(6)), lon: Number(lon.toFixed(6)) };
  }
}

function scoreRelationMemberRole(role?: string) {
  const r = String(role || '').toLowerCase();
  if (r === 'parking') return 120;
  if (r === 'guidepost') return 100;
  if (r === 'route_marker') return 80;
  if (r === 'approach') return 60;
  return 0;
}

export function getPreferredRelationStartPoi(
  relation: OSMRelation,
  nodesMap: Map<number, OSMNode>,
  waysMap: Map<number, OSMWay>,
  normalizeSpace: (value: unknown) => string
) {
  const candidates: Array<{
    role: string;
    roleScore: number;
    tags: Record<string, string>;
    coord: LatLon | null;
    label: string | null;
  }> = [];

  for (const member of relation.members || []) {
    const roleScore = scoreRelationMemberRole(member.role);
    if (roleScore <= 0) continue;

    let tags: Record<string, string> | null = null;
    let coord: LatLon | null = null;

    if (member.type === 'node') {
      const node = nodesMap.get(member.ref);
      if (!node) continue;
      tags = node.tags || {};
      coord =
        typeof node.lat === 'number' && typeof node.lon === 'number'
          ? { lat: Number(node.lat.toFixed(6)), lon: Number(node.lon.toFixed(6)) }
          : null;
    } else if (member.type === 'way') {
      const way = waysMap.get(member.ref);
      if (!way) continue;
      tags = way.tags || {};
      coord = getWayRepresentativeCoordinate(way, nodesMap);
    } else {
      continue;
    }

    const name = normalizeSpace(tags?.name || '');
    candidates.push({
      role: member.role || '',
      roleScore,
      tags: tags || {},
      coord,
      label: name || null,
    });
  }

  candidates.sort((a, b) => b.roleScore - a.roleScore);
  return candidates[0] || null;
}

import axios from 'axios';
import * as turf from '@turf/turf';

export type LatLon = {
  lat: number;
  lon: number;
};

export type ReverseGeocodeResult = {
  region: string | null;
  location: string | null;
  start_point: string | null;
  locality: string | null;
  county: string | null;
  district: string | null;
  road: string | null;
  hamlet: string | null;
  village: string | null;
  town: string | null;
  city: string | null;
  suburb: string | null;
  raw: any | null;
};

type GeocodeHelpersOptions = {
  enableReverseGeocode: boolean;
  nominatimUrl: string;
  geocodeCacheFile: string;
  poiCacheFile: string;
  normalizeSpace: (value: unknown) => string;
  uniqueJoin: (parts: Array<string | null | undefined>, separator?: string) => string;
  saveJson: (file: string, value: unknown) => void;
  sleep: (ms: number) => Promise<unknown>;
  postOverpass: (
    query: string,
    label: string,
    options?: {
      rounds?: number;
      timeoutMs?: number;
      endpointPauseMs?: number;
      roundPauseBaseMs?: number;
    }
  ) => Promise<{ elements: any[] }>;
};

export function createGeocodeHelpers(options: GeocodeHelpersOptions) {
  const {
    enableReverseGeocode,
    nominatimUrl,
    geocodeCacheFile,
    poiCacheFile,
    normalizeSpace,
    uniqueJoin,
    saveJson,
    sleep,
    postOverpass,
  } = options;



  function buildNearbyPoiQuery(lat: number, lon: number, radiusMeters = 300) {
    return `
[out:json][timeout:60];
(
  node(around:${radiusMeters},${lat},${lon})["name"]["amenity"="parking"];
  way(around:${radiusMeters},${lat},${lon})["name"]["amenity"="parking"];
  relation(around:${radiusMeters},${lat},${lon})["name"]["amenity"="parking"];

  node(around:${radiusMeters},${lat},${lon})["name"]["tourism"="information"];
  way(around:${radiusMeters},${lat},${lon})["name"]["tourism"="information"];
  relation(around:${radiusMeters},${lat},${lon})["name"]["tourism"="information"];

  node(around:${radiusMeters},${lat},${lon})["name"]["tourism"="attraction"];
  node(around:${radiusMeters},${lat},${lon})["name"]["tourism"="viewpoint"];

  node(around:${radiusMeters},${lat},${lon})["name"]["railway"="station"];
  node(around:${radiusMeters},${lat},${lon})["name"]["public_transport"="station"];
  node(around:${radiusMeters},${lat},${lon})["name"]["highway"="bus_stop"];

  node(around:${radiusMeters},${lat},${lon})["amenity"="parking"];
  way(around:${radiusMeters},${lat},${lon})["amenity"="parking"];
  relation(around:${radiusMeters},${lat},${lon})["amenity"="parking"];
);
out center tags;
`.trim();
  }

  function getElementCoordinate(el: any) {
    if (typeof el.lat === 'number' && typeof el.lon === 'number') {
      return { lat: Number(el.lat.toFixed(6)), lon: Number(el.lon.toFixed(6)) };
    }
    if (el.center && typeof el.center.lat === 'number' && typeof el.center.lon === 'number') {
      return { lat: Number(el.center.lat.toFixed(6)), lon: Number(el.center.lon.toFixed(6)) };
    }
    return null;
  }

  function getDistanceMeters(a: LatLon | null, b: LatLon | null) {
    if (!a || !b) return Number.MAX_SAFE_INTEGER;
    try {
      return Math.round(turf.distance([a.lon, a.lat], [b.lon, b.lat], { units: 'kilometers' }) * 1000);
    } catch {
      return Number.MAX_SAFE_INTEGER;
    }
  }

  function scoreNearbyPoiCandidate(
    candidate: { tags?: Record<string, string>; coord: LatLon },
    startCoord: LatLon
  ) {
    const tags = candidate.tags || {};
    const name = normalizeSpace(tags.name || '').toLowerCase();
    const distanceMeters = getDistanceMeters(startCoord, candidate.coord);

    let score = 0;
    if (tags.amenity === 'parking') score += 120;
    if (tags.tourism === 'information') score += 85;
    if (tags.railway === 'station' || tags.public_transport === 'station') score += 55;
    if (tags.highway === 'bus_stop') score += 35;
    if (tags.tourism === 'viewpoint') score += 30;
    if (tags.tourism === 'attraction') score += 25;

    if (name) score += 10;
    if (name.includes('car park')) score += 35;
    if (name.includes('parking')) score += 25;
    if (name.includes('visitor centre') || name.includes('visitor center')) score += 15;
    if (name.includes('trailhead')) score += 20;
    if (name.includes('station')) score += 8;

    if (distanceMeters <= 40) score += 30;
    else if (distanceMeters <= 80) score += 22;
    else if (distanceMeters <= 140) score += 14;
    else if (distanceMeters <= 220) score += 8;
    else if (distanceMeters <= 300) score += 3;
    else score -= 10;

    if (!name && tags.amenity !== 'parking') score -= 40;
    return score;
  }

  async function findNearbyStartPoi(startCoord: LatLon, poiCache: Record<string, any>) {
    const cacheKey = `${startCoord.lat.toFixed(4)},${startCoord.lon.toFixed(4)}`;
    if (Object.prototype.hasOwnProperty.call(poiCache, cacheKey)) {
      return poiCache[cacheKey];
    }

    const query = buildNearbyPoiQuery(startCoord.lat, startCoord.lon, 300);

    try {
      const osm = await postOverpass(query, `start-poi:${cacheKey}`, {
        rounds: 1,
        timeoutMs: 90000,
        endpointPauseMs: 2000,
        roundPauseBaseMs: 2000,
      });

      const candidates: Array<{ type: string; tags: Record<string, string>; coord: LatLon }> = [];
      for (const el of osm.elements || []) {
        const coord = getElementCoordinate(el);
        if (!coord) continue;
        candidates.push({ type: el.type, tags: el.tags || {}, coord });
      }

      candidates.sort(
        (a, b) => scoreNearbyPoiCandidate(b, startCoord) - scoreNearbyPoiCandidate(a, startCoord)
      );

      const best = candidates[0] || null;
      poiCache[cacheKey] = best;
      saveJson(poiCacheFile, poiCache);
      return best;
    } catch (error: any) {
      console.warn('[poi] nearby POI lookup failed:', {
        lat: startCoord.lat,
        lon: startCoord.lon,
        message: error.message,
      });

      poiCache[cacheKey] = null;
      saveJson(poiCacheFile, poiCache);
      return null;
    }
  }

  async function reverseGeocodeCached(
    lat: number,
    lon: number,
    cache: Record<string, ReverseGeocodeResult>,
    requestOptions: { zoom?: number } = {}
  ): Promise<ReverseGeocodeResult> {
    if (!enableReverseGeocode) {
      return {
        region: null,
        location: null,
        start_point: null,
        locality: null,
        county: null,
        district: null,
        road: null,
        hamlet: null,
        village: null,
        town: null,
        city: null,
        suburb: null,
        raw: null,
      };
    }

    const zoom = requestOptions.zoom ?? 10;
    const cacheKey = `${lat.toFixed(5)},${lon.toFixed(5)},z${zoom}`;
    if (cache[cacheKey]) return cache[cacheKey];

    const response = await axios.get(nominatimUrl, {
      params: {
        lat,
        lon,
        format: 'jsonv2',
        zoom,
        addressdetails: 1,
        email: undefined,
      },
      headers: {
        'User-Agent': 'trailfinder-collector/ts-monorepo',
        Accept: 'application/json',
      },
      timeout: 30000,
    });

    const address = response.data.address || {};
    const locality =
      address.village || address.town || address.city || address.hamlet || address.suburb || null;
    const county =
      address.county || address.state_district || address.region || address.state || null;
    const road =
      address.road || address.path || address.footway || address.pedestrian || address.cycleway || null;

    const result: ReverseGeocodeResult = {
      region: address.state || address.region || address.county || address.state_district || null,
      location: uniqueJoin([locality, county]) || null,
      start_point:
        uniqueJoin([address.attraction || address.neighbourhood || road || locality, county]) || null,
      locality,
      county,
      district: address.state_district || null,
      road,
      hamlet: address.hamlet || null,
      village: address.village || null,
      town: address.town || null,
      city: address.city || null,
      suburb: address.suburb || null,
      raw: response.data,
    };

    cache[cacheKey] = result;
    saveJson(geocodeCacheFile, cache);
    await sleep(1100);
    return result;
  }

  function buildLocationLabel(
    tags: Record<string, string>,
    startGeo: ReverseGeocodeResult | null,
    centroidGeo: ReverseGeocodeResult | null,
    baseRegion: string
  ) {
    const from = normalizeSpace(tags.from || '');
    const to = normalizeSpace(tags.to || '');
    const name = normalizeSpace(tags.name || '');

    if (from && to && from.toLowerCase() !== to.toLowerCase()) return `${from} to ${to}`;
    if (from) return from;
    if (to) return to;

    // Fallback: many long routes encode endpoints in name only.
    const nameToMatch = name.match(/^(.+?)\s+to\s+(.+)$/i);
    if (nameToMatch) {
      const a = normalizeSpace(nameToMatch[1]);
      const b = normalizeSpace(nameToMatch[2]);
      if (a && b && a.toLowerCase() !== b.toLowerCase()) return `${a} to ${b}`;
    }

    const tagLocality = normalizeSpace(
      tags['addr:city'] ||
        tags['addr:town'] ||
        tags['addr:village'] ||
        tags.locality ||
        tags.place ||
        ''
    );
    const tagCounty = normalizeSpace(
      tags['addr:county'] ||
        tags.county ||
        tags['is_in:county'] ||
        tags['addr:state_district'] ||
        ''
    );
    const tagDistrict = normalizeSpace(
      tags['addr:district'] || tags.district || tags['is_in:district'] || ''
    );

    if (tagLocality && tagCounty) return `${tagLocality}, ${tagCounty}`;
    if (tagLocality && tagDistrict) return `${tagLocality}, ${tagDistrict}`;
    if (tagLocality) return tagLocality;
    if (tagCounty) return tagCounty;
    if (tagDistrict) return tagDistrict;

    if (startGeo?.locality && startGeo?.county) return `${startGeo.locality}, ${startGeo.county}`;
    if (startGeo?.locality) return startGeo.locality;
    if (centroidGeo?.location) return centroidGeo.location;
    if (centroidGeo?.locality && centroidGeo?.county) return `${centroidGeo.locality}, ${centroidGeo.county}`;
    if (centroidGeo?.locality) return centroidGeo.locality;
    if (centroidGeo?.county) return centroidGeo.county;

    // Never fall back to raw coordinates; keep a readable place label.
    if (baseRegion) return `Near ${baseRegion}`;
    return 'Near trail area';
  }

  function buildStartPointFromPoi(
    poi: { tags?: Record<string, string> } | null,
    startGeo: ReverseGeocodeResult | null
  ) {
    if (!poi) return null;
    const tags = poi.tags || {};
    const rawName = normalizeSpace(tags.name || '');

    if (rawName) {
      if (tags.amenity === 'parking' && /^car park$/i.test(rawName) && startGeo?.locality) {
        return `${startGeo.locality} village car park`;
      }
      return rawName;
    }

    if (tags.amenity === 'parking' && startGeo?.locality) {
      return `${startGeo.locality} village car park`;
    }
    if (tags.tourism === 'information' && startGeo?.locality) {
      return `${startGeo.locality} visitor information point`;
    }

    return null;
  }

  function buildStartPointLabel(
    tags: Record<string, string>,
    relationStartPoi: { tags?: Record<string, string> } | null,
    nearbyPoi: { tags?: Record<string, string> } | null,
    startGeo: ReverseGeocodeResult | null,
    location: string
  ) {
    const explicit = normalizeSpace(tags.start || tags.start_point || tags.trailhead || '');
    if (explicit) return explicit;

    const from = normalizeSpace(tags.from || '');
    const relationStartLabel = buildStartPointFromPoi(relationStartPoi, startGeo);
    if (relationStartLabel) return relationStartLabel;

    const nearbyPoiLabel = buildStartPointFromPoi(nearbyPoi, startGeo);
    if (nearbyPoiLabel) return nearbyPoiLabel;

    if (from && startGeo?.road) return `${from}, ${startGeo.road}`;
    if (from) return from;
    if (startGeo?.road && startGeo?.locality) return `${startGeo.road}, ${startGeo.locality}`;
    if (startGeo?.locality) return `${startGeo.locality} village`;
    if (location) return location;
    return 'Trail start';
  }

  return {
    inferRegionFromCoordinates,
    findNearbyStartPoi,
    reverseGeocodeCached,
    buildLocationLabel,
    buildStartPointLabel,
    getDistanceMeters,
  };
}
function inferRegionFromCoordinates(lat: number, lon: number) {
  // Scotland (finer split)
  if (lat >= 58.9) return 'Northern Highlands';
  if (lat >= 57.9 && lon <= -4.8) return 'Northwest Highlands';
  if (lat >= 57.9) return 'Moray and Northeast Highlands';
  if (lat >= 57.1 && lon <= -5.0) return 'West Highlands and Skye';
  if (lat >= 57.1) return 'Cairngorms and Central Highlands';
  if (lat >= 56.5 && lon <= -5.0) return 'Argyll and West Coast';
  if (lat >= 56.5) return 'Perthshire and Angus';
  if (lat >= 55.9 && lon <= -4.2) return 'Loch Lomond and Trossachs';
  if (lat >= 55.9) return 'South Scotland';

  // North England
  if (lat >= 54.95 && lon <= -3.0) return 'Lake District and Cumbria';
  if (lat >= 54.7 && lon > -2.0) return 'North York Moors and Teesdale';
  if (lat >= 54.45 && lon <= -2.0) return 'Yorkshire Dales and Pennines';
  if (lat >= 54.2 && lon <= -2.8) return 'North Pennines';
  if (lat >= 54.2) return 'Yorkshire and Durham';

  // Wales
  if (lat >= 53.05 && lon <= -3.3) return 'Eryri (Snowdonia), North Wales';
  if (lat >= 52.35 && lon <= -4.6) return 'Mid Wales and Ceredigion';
  if (lat >= 51.95 && lon <= -3.8) return 'Brecon Beacons and South Wales Valleys';
  if (lat >= 51.45 && lon <= -4.8) return 'Pembrokeshire and West Wales Coast';
  if (lat >= 51.45 && lon <= -3.0) return 'South Wales Coast';

  // Midlands / South England
  if (lat >= 53.3 && lon > -2.6) return 'Peak District and East Pennines';
  if (lat >= 52.6 && lon > -2.2) return 'Midlands';
  if (lat >= 52.2 && lon <= -2.2) return 'Welsh Borders and Severn Valley';

  if (lat >= 51.55 && lon <= -4.6) return 'Devon and Cornwall';
  if (lat >= 51.25 && lon <= -3.5) return 'Exmoor and Somerset';
  if (lat >= 51.25 && lon <= -2.2) return 'Cotswolds and Wessex';
  if (lat >= 51.05 && lon <= -1.5) return 'Hampshire and South Downs West';
  if (lat >= 51.05) return 'South East England and Downs';

  return 'South England Coast';
}
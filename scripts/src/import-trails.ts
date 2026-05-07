import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import { createImageResolver } from './import-trails.image.js';
import { createOverpassClient } from './import-trails.overpass.js';
import {
  buildElementMaps,
  buildGeometryFromRelation,
  getCentroid,
  getLengthKm,
  getPreferredRelationStartPoi,
  getRepresentativeStartCoordinate,
  isTrailRelation,
} from './import-trails.overpass.js';
import { createGeocodeHelpers, type ReverseGeocodeResult } from './import-trails.geocode.js';
import {
  buildDescription,
  buildTagsArray,
  estimateDurationHours,
  extractHighlights,
  inferDifficulty,
  inferElevationGain,
  inferPopularityScore,
  inferRating,
  inferReviewCount,
  inferScenery,
  inferTerrain,
} from './import-trails.enrich.js';
import { insertTrail, loadExistingTrailKeys, makeTrailKey } from './import-trails.db.js';

type ImageInfo = {
  url: string;
  width: number | null;
  height: number | null;
  source: string;
  title?: string | null;
  description?: string | null;
  categories?: string[];
  mime?: string | null;
  mediatype?: string | null;
  pageUrl?: string | null;
  photographer?: string | null;
  license?: string | null;
} | null;

type TrailRow = {
  name: string;
  region: string;
  location: string;
  lengthKm: number;
  elevationGainM: number;
  difficulty: 'easy' | 'moderate' | 'hard' | 'expert';
  terrain: string;
  scenery: string;
  description: string;
  highlights: string;
  estimatedDurationHours: number;
  popularityScore: number;
  rating: number;
  reviewCount: number;
  imageUrl: string | null;
  startPoint: string;
  tags: string;
};

// ============================================================================
// ENV / PATHS
// ============================================================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPO_ROOT = path.resolve(__dirname, '../..');

const rootEnvPath = path.join(REPO_ROOT, '.env');
const scriptsEnvPath = path.resolve(__dirname, '../.env');

if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else if (fs.existsSync(scriptsEnvPath)) {
  dotenv.config({ path: scriptsEnvPath });
} else {
  dotenv.config();
}

function decodeMaybePercentEncoded(value: string) {
  try {
    return /%[0-9A-Fa-f]{2}/.test(value) ? decodeURIComponent(value) : value;
  } catch {
    return value;
  }
}

function getPgConfig() {
  const host = process.env.PGHOST?.trim();
  const portRaw = process.env.PGPORT?.trim();
  const user = process.env.PGUSER?.trim();
  const passwordRaw = process.env.PGPASSWORD?.trim();
  const database = process.env.PGDATABASE?.trim();

  const hasDiscreteConfig =
    Boolean(host) &&
    Boolean(portRaw) &&
    Boolean(user) &&
    Boolean(passwordRaw) &&
    Boolean(database);

  if (hasDiscreteConfig) {
    const port = Number(portRaw);
    if (!Number.isFinite(port)) {
      throw new Error(`Invalid PGPORT: ${portRaw}`);
    }

    return {
      host,
      port,
      user,
      password: decodeMaybePercentEncoded(passwordRaw as string),
      database,
    };
  }

  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) {
    throw new Error(
      'Missing database config. Provide DATABASE_URL or PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE.'
    );
  }

  return {
    connectionString: databaseUrl,
  };
}

const pool = new Pool(getPgConfig());

const DEFAULT_OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const OVERPASS_ENDPOINTS = (
  process.env.OVERPASS_URLS || DEFAULT_OVERPASS_ENDPOINTS.join(',')
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

const ENABLE_REVERSE_GEOCODE =
  String(process.env.ENABLE_REVERSE_GEOCODE ?? 'true').toLowerCase() === 'true';

const ENABLE_IMAGE_LOOKUP =
  String(process.env.ENABLE_IMAGE_LOOKUP ?? 'true').toLowerCase() === 'true';

const ENABLE_GEOGRAPH_FALLBACK =
  String(process.env.ENABLE_GEOGRAPH_FALLBACK ?? 'true').toLowerCase() === 'true';

const GEOGRAPH_API_KEY = process.env.GEOGRAPH_API_KEY?.trim() || '';

const ENABLE_START_POI_LOOKUP =
  String(process.env.ENABLE_START_POI_LOOKUP ?? 'true').toLowerCase() === 'true';

const CLEAR_EXISTING =
  String(process.env.CLEAR_EXISTING).toLowerCase() === 'true';

const NOMINATIM_URL =
  process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org/reverse';

const DEFAULT_BBOXES = [
  '49.8,-8.7,51.0,2.2',
  '50.9,-8.7,52.0,2.2',
  '51.9,-8.7,53.0,2.2',
  '52.9,-8.7,54.0,2.2',
  '53.9,-8.7,55.0,2.2',
  '54.9,-8.7,56.0,2.2',
  '55.9,-8.0,57.0,1.8',
  '56.9,-7.5,58.0,1.2',
  '57.9,-7.0,59.2,0.8',
  '59.1,-6.5,60.9,0.5',
];

const BBOXES = (process.env.BBOXES || DEFAULT_BBOXES.join(';'))
  .split(';')
  .map((s) => s.trim())
  .filter(Boolean);

const CACHE_DIR = path.join(REPO_ROOT, '.cache', 'trail-import');
const LOG_DIR = path.join(CACHE_DIR, 'logs');
const GEOCODE_CACHE_FILE = path.join(CACHE_DIR, 'geocode-cache.json');
const IMAGE_CACHE_FILE = path.join(CACHE_DIR, 'image-cache.json');
const POI_CACHE_FILE = path.join(CACHE_DIR, 'poi-cache.json');

// ============================================================================
// GENERIC HELPERS
// ============================================================================

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function ensureDir(dir: string) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function loadJson<T>(file: string, fallback: T): T {
  try {
    if (!fs.existsSync(file)) return fallback;
    return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

function saveJson(file: string, value: unknown) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf8');
}

function nowStamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function shortText(value: unknown, max = 3000) {
  const text =
    typeof value === 'string'
      ? value
      : value == null
        ? ''
        : JSON.stringify(value, null, 2);

  return text.length > max ? `${text.slice(0, max)}\n...truncated...` : text;
}

function writeDebugLog(name: string, data: unknown) {
  ensureDir(LOG_DIR);
  const file = path.join(LOG_DIR, `${nowStamp()}-${name}.log`);
  fs.writeFileSync(
    file,
    typeof data === 'string' ? data : JSON.stringify(data, null, 2),
    'utf8'
  );
  console.log(`[debug] wrote log: ${file}`);
}

function parseJsonSafe(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function normalizeSpace(value: unknown) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function uniqueJoin(parts: Array<string | null | undefined>, separator = ', ') {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const part of parts) {
    const clean = normalizeSpace(part);
    if (!clean) continue;

    const key = clean.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }

  return out.join(separator);
}

const BROAD_REGION_NAMES = new Set([
  'uk',
  'united kingdom',
  'great britain',
  'england',
  'scotland',
  'wales',
  'northern ireland',
]);

function isBroadRegionName(value: string) {
  const normalized = normalizeSpace(value).toLowerCase();
  return BROAD_REGION_NAMES.has(normalized);
}

function inferSeedStyleRegionFromText(name: string, tags: Record<string, string>) {
  const text = `${name} ${tags.name || ''} ${tags.from || ''} ${tags.to || ''} ${tags.description || ''}`
    .toLowerCase();

  if (/\b(snowdon|yr wyddfa|tryfan|glyder|cadair idris|eryri)\b/.test(text)) return 'Snowdonia';
  if (/\b(scafell|helvellyn|catbells|langdale|wainwright|borrowdale)\b/.test(text)) return 'Lake District';
  if (/\b(kinder scout|mam tor|stanage|dovedale|peak district)\b/.test(text)) return 'Peak District';
  if (/\b(cairngorm|braeriach|ben macdui|avimore)\b/.test(text)) return 'Cairngorms';
  if (/\b(ben nevis|glencoe|fort william|west highland)\b/.test(text)) return 'Scottish Highlands';
  if (/\b(pembrokeshire|brecon beacons|bannau brycheiniog)\b/.test(text)) return 'South Wales';
  if (/\b(cotswold)\b/.test(text)) return 'Cotswolds';
  if (/\b(south downs)\b/.test(text)) return 'South Downs';

  return null;
}

function deriveRegionLabel(
  centroidGeo: ReverseGeocodeResult | null,
  baseRegion: string,
  tags?: Record<string, string>,
  trailName = ''
) {
  const seeded = inferSeedStyleRegionFromText(trailName, tags || {});
  if (seeded) return seeded;

  const tagCounty = normalizeSpace(
    tags?.['addr:county'] || tags?.county || tags?.['is_in:county'] || ''
  );
  const tagDistrict = normalizeSpace(
    tags?.['addr:district'] || tags?.district || tags?.['is_in:district'] || ''
  );

  // For region, keep area-style labels first (baseRegion), then admin names.
  if (baseRegion && !isBroadRegionName(baseRegion)) return baseRegion;

  if (tagDistrict && tagCounty && tagDistrict.toLowerCase() !== tagCounty.toLowerCase()) {
    return `${tagDistrict} • ${tagCounty}`;
  }
  if (tagCounty) return tagCounty;
  if (tagDistrict) return tagDistrict;

  const county = normalizeSpace(centroidGeo?.county);
  const district = normalizeSpace(centroidGeo?.district);
  const locality = normalizeSpace(centroidGeo?.locality);
  const region = normalizeSpace(centroidGeo?.region);

  if (district && county && district.toLowerCase() !== county.toLowerCase()) {
    return `${district} • ${county}`;
  }
  if (county) return county;
  if (district) return district;

  if (region && !isBroadRegionName(region)) return region;

  if (locality && county) return `${locality} • ${county}`;
  if (locality) return locality;

  return baseRegion || region || 'South England Coast';
}

const overpassClient = createOverpassClient({
  overpassEndpoints: OVERPASS_ENDPOINTS,
  shortText,
  writeDebugLog,
  parseJsonSafe,
  sleep,
});

const geocodeHelpers = createGeocodeHelpers({
  enableReverseGeocode: ENABLE_REVERSE_GEOCODE,
  nominatimUrl: NOMINATIM_URL,
  geocodeCacheFile: GEOCODE_CACHE_FILE,
  poiCacheFile: POI_CACHE_FILE,
  normalizeSpace,
  uniqueJoin,
  saveJson,
  sleep,
  postOverpass: overpassClient.postOverpass,
});

const resolveBestImage = createImageResolver({
  imageCacheFile: IMAGE_CACHE_FILE,
  geographApiKey: GEOGRAPH_API_KEY,
  enableImageLookup: ENABLE_IMAGE_LOOKUP,
  enableGeographFallback: ENABLE_GEOGRAPH_FALLBACK,
  normalizeSpace,
  saveJson,
  getDistanceMeters: geocodeHelpers.getDistanceMeters,
});

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  ensureDir(CACHE_DIR);
  ensureDir(LOG_DIR);

  const geocodeCache = loadJson<Record<string, ReverseGeocodeResult>>(GEOCODE_CACHE_FILE, {});
  const imageCache = loadJson<Record<string, ImageInfo>>(IMAGE_CACHE_FILE, {});
  const poiCache = loadJson<Record<string, any>>(POI_CACHE_FILE, {});
  const client = await pool.connect();

  try {
    console.log('='.repeat(80));
    console.log('[startup] trail importer starting');
    console.log(`[startup] cwd=${process.cwd()}`);
    console.log(`[startup] reverse geocode=${ENABLE_REVERSE_GEOCODE}`);
    console.log(`[startup] image lookup=${ENABLE_IMAGE_LOOKUP}`);
    console.log(`[startup] geograph fallback=${ENABLE_GEOGRAPH_FALLBACK}`);
    console.log(`[startup] geograph key present=${GEOGRAPH_API_KEY ? 'yes' : 'no'}`);
    console.log(`[startup] start poi lookup=${ENABLE_START_POI_LOOKUP}`);
    console.log(`[startup] clear existing=${CLEAR_EXISTING}`);
    console.log(`[startup] bbox count=${BBOXES.length}`);
    console.log(`[startup] endpoints=${OVERPASS_ENDPOINTS.join(' | ')}`);
    console.log('='.repeat(80));

    const dbCheck = await client.query('SELECT NOW() AS now');
    console.log(`[db] connected ok, server time=${dbCheck.rows[0].now}`);

    if (CLEAR_EXISTING) {
      console.log('[db] clearing existing trails...');
      await client.query('BEGIN');
      try {
        // `hiking_history.trail_id -> trails.id` blocks deleting trails first.
        // Clear dependent rows, then clear trails.
        await client.query('DELETE FROM hiking_history');
        await client.query('DELETE FROM trails');
        await client.query('COMMIT');
        console.log('[db] existing trails (and dependent hiking history) deleted');
      } catch (clearError) {
        await client.query('ROLLBACK');
        throw clearError;
      }
    }

    const existingKeys = await loadExistingTrailKeys(client);
    console.log(`[db] loaded existing keys: ${existingKeys.size}`);

    let grandInserted = 0;
    let grandSkippedDuplicate = 0;

    for (let i = 0; i < BBOXES.length; i++) {
      const bbox = BBOXES[i];
      console.log(`\n${'-'.repeat(80)}`);
      console.log(`[bbox ${i + 1}/${BBOXES.length}] ${bbox}`);

      const query = overpassClient.buildOverpassQuery(bbox);
      const osm = await overpassClient.postOverpass(query, bbox);

      const rawFile = path.join(
        CACHE_DIR,
        `overpass-${bbox.replace(/[^\d.-]/g, '_')}.json`
      );
      fs.writeFileSync(rawFile, JSON.stringify(osm, null, 2), 'utf8');
      console.log(`[bbox ${i + 1}] saved raw JSON -> ${rawFile}`);

      const { nodes, ways, relations } = buildElementMaps(osm);

      console.log(
        `[bbox ${i + 1}] nodes=${nodes.size}, ways=${ways.size}, relations=${relations.length}`
      );

      let candidateRelations = 0;
      let inserted = 0;
      let skippedNotTrail = 0;
      let skippedNoGeometry = 0;
      let skippedNoCentroid = 0;
      let skippedDuplicate = 0;
      let skippedDbError = 0;

      for (const relation of relations) {
        if (!isTrailRelation(relation)) {
          skippedNotTrail += 1;
          continue;
        }

        candidateRelations += 1;

        const tags = relation.tags || {};
        const geometry = buildGeometryFromRelation(relation, ways, nodes);

        if (!geometry) {
          skippedNoGeometry += 1;
          continue;
        }

        const centroid = getCentroid(geometry);
        if (!centroid) {
          skippedNoCentroid += 1;
          continue;
        }

        const relationStartPoi = getPreferredRelationStartPoi(relation, nodes, ways, normalizeSpace);
        const startCoord =
          relationStartPoi?.coord || getRepresentativeStartCoordinate(geometry);

        const centroidGeo = await geocodeHelpers.reverseGeocodeCached(
          centroid.lat,
          centroid.lon,
          geocodeCache,
          { zoom: 10 }
        );

        const startGeo = startCoord
          ? await geocodeHelpers.reverseGeocodeCached(
              startCoord.lat,
              startCoord.lon,
              geocodeCache,
              { zoom: 18 }
            )
          : null;

        const nearbyStartPoi =
          ENABLE_START_POI_LOOKUP &&
          startCoord &&
          !normalizeSpace(tags.start || tags.start_point || tags.trailhead || '')
            ? await geocodeHelpers.findNearbyStartPoi(startCoord, poiCache)
            : null;

        const baseRegion = geocodeHelpers.inferRegionFromCoordinates(centroid.lat, centroid.lon);
        const trailName = tags.name || 'Unnamed Trail';
        const region = deriveRegionLabel(centroidGeo, baseRegion, tags, trailName);
        const location = geocodeHelpers.buildLocationLabel(
          tags,
          startGeo,
          centroidGeo,
          baseRegion
        );
        const startPoint = geocodeHelpers.buildStartPointLabel(
          tags,
          relationStartPoi,
          nearbyStartPoi,
          startGeo,
          location
        );

        const earlyKey = makeTrailKey(tags.name || 'Unnamed Trail', location);
        if (existingKeys.has(earlyKey)) {
          skippedDuplicate += 1;
          grandSkippedDuplicate += 1;
          continue;
        }

        let elevationGainM = inferElevationGain(tags, null, null);
        const roughLengthKm = getLengthKm(geometry);
        const roughDifficulty = inferDifficulty(tags, roughLengthKm, elevationGainM);
        elevationGainM = inferElevationGain(tags, roughLengthKm, roughDifficulty);
        const difficulty = inferDifficulty(tags, roughLengthKm, elevationGainM);

        const lengthKm = roughLengthKm != null ? roughLengthKm : 5.0;
        const terrain = inferTerrain(tags);
        const scenery = inferScenery(tags);
        const popularityScore = inferPopularityScore(tags, tags.name || 'Unnamed Trail');
        const rating = inferRating(popularityScore, difficulty, `${tags.name || ''}|${location}`);
        const reviewCount = inferReviewCount(popularityScore, `${tags.name || ''}|${region}`);
        const highlights = extractHighlights(tags, tags.name || 'Unnamed Trail', terrain, scenery);
        const description = buildDescription(tags, {
          name: trailName,
          region,
          lengthKm,
          elevationGainM,
          difficulty,
          scenery,
        });

        const tagArray = buildTagsArray(tags, difficulty, terrain, scenery, region);
        const bestImage = await resolveBestImage(tags, imageCache, {
          startCoord,
          centroidCoord: centroid,
          location,
          region,
        });

        const row: TrailRow = {
          name: tags.name || 'Unnamed Trail',
          region,
          location,
          lengthKm: Number(lengthKm.toFixed(2)),
          elevationGainM: Number(elevationGainM),
          difficulty,
          terrain,
          scenery,
          description,
          highlights,
          estimatedDurationHours: estimateDurationHours(lengthKm, difficulty, elevationGainM),
          popularityScore,
          rating,
          reviewCount,
          imageUrl: bestImage?.url || null,
          startPoint,
          tags: JSON.stringify(tagArray),
        };

        try {
          const insertedResult = await insertTrail(client, row);
          inserted += 1;
          grandInserted += 1;

          existingKeys.add(makeTrailKey(row.name, row.location));

          if (inserted <= 5) {
            console.log(
              `[sample insert] [${insertedResult.rows[0].id}] ${row.name} | region=${row.region} | location=${row.location} | startPoint=${row.startPoint} | len=${row.lengthKm} | elev=${row.elevationGainM} | diff=${row.difficulty} | image=${row.imageUrl || 'null'}`
            );
          }

          if (inserted % 25 === 0) {
            console.log(
              `[bbox ${i + 1}] inserted=${inserted}, candidateRelations=${candidateRelations}, skippedDuplicate=${skippedDuplicate}, skippedNoGeometry=${skippedNoGeometry}`
            );
          }
        } catch (dbError: any) {
          skippedDbError += 1;
          console.error('[db] insert failed:', {
            name: row.name,
            location: row.location,
            message: dbError.message,
            code: dbError.code || null,
          });

          writeDebugLog('db-insert-error', {
            name: row.name,
            location: row.location,
            message: dbError.message,
            code: dbError.code || null,
            detail: dbError.detail || null,
            hint: dbError.hint || null,
            row,
          });
        }
      }

      console.log(`[bbox ${i + 1}] candidateRelations=${candidateRelations}`);
      console.log(`[bbox ${i + 1}] inserted=${inserted}`);
      console.log(`[bbox ${i + 1}] skippedNotTrail=${skippedNotTrail}`);
      console.log(`[bbox ${i + 1}] skippedNoGeometry=${skippedNoGeometry}`);
      console.log(`[bbox ${i + 1}] skippedNoCentroid=${skippedNoCentroid}`);
      console.log(`[bbox ${i + 1}] skippedDuplicate=${skippedDuplicate}`);
      console.log(`[bbox ${i + 1}] skippedDbError=${skippedDbError}`);
    }

    const totalRows = await client.query('SELECT COUNT(*)::int AS count FROM trails');
    console.log('\n' + '='.repeat(80));
    console.log(`[done] insertedThisRun=${grandInserted}`);
    console.log(`[done] skippedDuplicateThisRun=${grandSkippedDuplicate}`);
    console.log(`[done] totalRowsInDb=${totalRows.rows[0].count}`);
    console.log('='.repeat(80));
  } catch (error: any) {
    console.error('\n[fatal] import failed');
    console.error('[fatal] message:', error.message);
    console.error('[fatal] code:', error.code || 'n/a');

    if (error.response) {
      console.error('[fatal] response status:', error.response.status);
      console.error('[fatal] response body:', shortText(error.response.data, 4000));
    }

    writeDebugLog('fatal-error', {
      message: error.message,
      code: error.code || null,
      stack: error.stack || null,
      responseStatus: error.response?.status || null,
      responseBody: shortText(error.response?.data, 4000),
    });

    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
    console.log('[shutdown] db pool closed');
  }
}

main();
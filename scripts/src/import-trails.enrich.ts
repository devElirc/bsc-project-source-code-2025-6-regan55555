export type TrailDifficulty = 'easy' | 'moderate' | 'hard' | 'expert';

function stableHash(value: string) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function parseNumericMeters(value: unknown) {
  if (value == null) return null;
  const raw = String(value).trim().toLowerCase();
  const match = raw.match(/-?\d+(\.\d+)?/);
  if (!match) return null;
  return Math.round(Number(match[0]));
}

function mapSacScaleToDifficulty(sacScale?: string) {
  const v = String(sacScale || '').toLowerCase();

  if (!v) return null;
  if (v === 'strolling' || v === 'hiking') return 'easy';
  if (v === 'mountain_hiking') return 'moderate';
  if (v === 'demanding_mountain_hiking') return 'hard';
  if (
    v === 'alpine_hiking' ||
    v === 'demanding_alpine_hiking' ||
    v === 'difficult_alpine_hiking'
  ) {
    return 'expert';
  }

  return null;
}

export function inferElevationGain(
  tags: Record<string, string>,
  lengthKm: number | null,
  difficulty: string | null
) {
  const directValues = [
    tags['ele:gain'],
    tags.ele_gain,
    tags.ascent,
    tags.climb,
    tags.elevation_gain,
  ];

  for (const value of directValues) {
    const parsed = parseNumericMeters(value);
    if (parsed != null) return parsed;
  }

  if (lengthKm == null) return 250;

  if (difficulty === 'easy') return Math.round(lengthKm * 20);
  if (difficulty === 'moderate') return Math.round(lengthKm * 40);
  if (difficulty === 'hard') return Math.round(lengthKm * 65);
  if (difficulty === 'expert') return Math.round(lengthKm * 90);

  return Math.round(lengthKm * 30);
}

export function inferDifficulty(
  tags: Record<string, string>,
  lengthKm: number | null,
  elevationGainM: number | null
): TrailDifficulty {
  const fromSac = mapSacScaleToDifficulty(tags.sac_scale);
  if (fromSac) return fromSac as TrailDifficulty;

  const explicit = String(tags.difficulty || '').toLowerCase();
  if (['easy', 'moderate', 'hard', 'expert'].includes(explicit)) {
    return explicit as TrailDifficulty;
  }

  if (lengthKm == null) return 'moderate';

  if (elevationGainM != null) {
    if (lengthKm < 8 && elevationGainM < 200) return 'easy';
    if (lengthKm < 15 && elevationGainM < 500) return 'moderate';
    if (lengthKm < 25 && elevationGainM < 900) return 'hard';
    return 'expert';
  }

  if (lengthKm < 8) return 'easy';
  if (lengthKm < 16) return 'moderate';
  if (lengthKm < 25) return 'hard';
  return 'expert';
}

export function inferTerrain(tags: Record<string, string>) {
  const text = [
    tags.surface,
    tags.trail_visibility,
    tags.sac_scale,
    tags.description,
    tags.note,
    tags.name,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (text.includes('rock') || text.includes('ridge') || text.includes('scree')) {
    return 'Rocky ridge, mountain';
  }
  if (text.includes('moor') || text.includes('bog') || text.includes('peat')) {
    return 'Moorland, peat bog';
  }
  if (text.includes('forest') || text.includes('wood') || text.includes('woodland')) {
    return 'Forest track, woodland';
  }
  if (text.includes('coast') || text.includes('cliff') || text.includes('shore')) {
    return 'Coastal cliff path';
  }
  if (text.includes('chalk')) return 'Chalk downland, grassy ridge';
  if (text.includes('limestone')) return 'Limestone path, upland';
  if (text.includes('gravel') || text.includes('compacted') || text.includes('track')) {
    return 'Gravel track, mixed trail';
  }
  if (text.includes('paved') || text.includes('asphalt') || text.includes('concrete')) {
    return 'Paved path, urban edge';
  }

  return 'Mixed terrain';
}

export function inferScenery(tags: Record<string, string>) {
  const text = [tags.name, tags.description, tags.note, tags.from, tags.to]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  if (
    text.includes('coast') ||
    text.includes('cliff') ||
    text.includes('sea') ||
    text.includes('shore') ||
    text.includes('beach')
  ) {
    return 'Coastal views, cliffs';
  }
  if (
    text.includes('mount') ||
    text.includes('summit') ||
    text.includes('fell') ||
    text.includes('peak') ||
    text.includes('mountain')
  ) {
    return 'Mountain summit, upland views';
  }
  if (text.includes('forest') || text.includes('wood') || text.includes('woodland')) {
    return 'Woodland, forest';
  }
  if (
    text.includes('river') ||
    text.includes('water') ||
    text.includes('lake') ||
    text.includes('loch') ||
    text.includes('tarn')
  ) {
    return 'Lakes, rivers, waterside';
  }
  if (
    text.includes('moor') ||
    text.includes('down') ||
    text.includes('vale') ||
    text.includes('valley')
  ) {
    return 'Open moorland, valleys';
  }

  return 'Mixed scenery';
}

export function extractHighlights(
  tags: Record<string, string>,
  name: string,
  terrain: string,
  scenery: string
) {
  const highlights = new Set<string>();
  const text = `${name || ''} ${terrain || ''} ${scenery || ''} ${tags.description || ''}`.toLowerCase();

  if (text.includes('summit') || text.includes('peak')) highlights.add('Summit views');
  if (text.includes('coast') || text.includes('cliff')) highlights.add('Coastal scenery');
  if (text.includes('lake') || text.includes('loch') || text.includes('tarn')) highlights.add('Water views');
  if (text.includes('forest') || text.includes('wood')) highlights.add('Woodland sections');
  if (text.includes('moor')) highlights.add('Open moorland');
  if (text.includes('ridge')) highlights.add('Ridge walking');
  if (text.includes('river') || text.includes('waterfall')) highlights.add('Rivers and waterfalls');

  if (tags.ref) highlights.add(`Route ref ${tags.ref}`);
  if (tags.network === 'iwn' || tags.network === 'nwn' || tags.network === 'rwn') {
    highlights.add('Signed long-distance route');
  }
  if (tags.wikipedia || tags.wikidata) highlights.add('Well-known route');

  return Array.from(highlights).slice(0, 5).join(', ') || 'Scenic walking route';
}

export function buildDescription(
  tags: Record<string, string>,
  row: Pick<
    {
      name: string;
      region: string;
      lengthKm: number;
      elevationGainM: number;
      difficulty: TrailDifficulty;
      scenery: string;
    },
    'name' | 'region' | 'lengthKm' | 'elevationGainM' | 'difficulty' | 'scenery'
  >
) {
  if (tags.description) return tags.description;

  const routeWord =
    tags.route === 'walking' ? 'walking' : tags.route === 'foot' ? 'walking' : 'hiking';

  const parts: string[] = [];
  parts.push(`${row.name} is a ${row.difficulty} ${routeWord} route`);

  if (row.region) parts.push(`in ${row.region}`);
  if (row.lengthKm != null) parts.push(`covering about ${row.lengthKm} km`);
  if (row.elevationGainM != null) parts.push(`with roughly ${row.elevationGainM} m of climbing`);
  if (row.scenery) parts.push(`featuring ${String(row.scenery).toLowerCase()}`);

  return `${parts.join(' ')}.`;
}

export function buildTagsArray(
  tags: Record<string, string>,
  difficulty: TrailDifficulty,
  terrain: string,
  scenery: string,
  region: string
) {
  const out = new Set<string>();
  const fields = [
    tags.route,
    tags.network,
    tags.sac_scale,
    tags.surface,
    tags.trail_visibility,
    tags.operator,
    tags.ref,
    difficulty,
    region,
  ];

  for (const value of fields) {
    if (value) out.add(String(value).toLowerCase());
  }

  const text = `${tags.name || ''} ${terrain || ''} ${scenery || ''}`.toLowerCase();
  if (text.includes('coast')) out.add('coastal');
  if (text.includes('peak') || text.includes('mount') || text.includes('fell') || text.includes('summit')) out.add('mountain');
  if (text.includes('forest') || text.includes('wood')) out.add('forest');
  if (text.includes('river') || text.includes('lake') || text.includes('loch')) out.add('waterside');
  if (text.includes('moor')) out.add('moorland');
  if (text.includes('ridge')) out.add('ridge');
  if (text.includes('cliff')) out.add('cliffs');
  if (text.includes('valley')) out.add('valley');

  return Array.from(out);
}

export function inferPopularityScore(tags: Record<string, string>, name: string) {
  let score = 35;

  if (tags.ref) score += 8;
  if (tags.network === 'iwn') score += 20;
  if (tags.network === 'nwn') score += 15;
  if (tags.network === 'rwn') score += 10;
  if (tags.wikipedia) score += 8;
  if (tags.wikidata) score += 6;
  if (tags.website || tags.url) score += 4;

  const text = String(name || '').toLowerCase();
  if (text.includes('way')) score += 4;
  if (text.includes('trail')) score += 4;
  if (text.includes('path')) score += 2;
  if (text.includes('coast') || text.includes('peak') || text.includes('snowdon')) score += 5;

  // A small deterministic spread reduces clustering when tags are sparse.
  const spread = (stableHash(`${name}|${tags.ref || ''}|${tags.network || ''}`) % 13) - 6;
  score += spread;

  return Math.max(18, Math.min(98, score));
}

export function inferRating(
  popularityScore: number,
  difficulty: TrailDifficulty,
  seedText = ''
) {
  let rating = 3.7 + (popularityScore / 100) * 1.15;

  if (difficulty === 'easy') rating += 0.08;
  if (difficulty === 'moderate') rating += 0.03;
  if (difficulty === 'hard') rating -= 0.03;
  if (difficulty === 'expert') rating -= 0.08;

  // Deterministic jitter prevents near-identical ratings across imported trails.
  const jitter = ((stableHash(`${seedText}|${difficulty}|${popularityScore}`) % 21) - 10) / 100;
  rating += jitter;

  return Number(Math.max(3.4, Math.min(4.9, rating)).toFixed(1));
}

export function inferReviewCount(popularityScore: number, seedText = '') {
  const p = Math.max(0, Math.min(100, popularityScore)) / 100;
  const base = 30 + Math.round(Math.pow(p, 2.1) * 6200);
  const spread = stableHash(seedText) % 280;
  return base + spread;
}

export function estimateDurationHours(
  lengthKm: number | null,
  difficulty: TrailDifficulty,
  elevationGainM: number | null
) {
  if (lengthKm == null) return 3.0;

  let speed = 4.5;
  if (difficulty === 'moderate') speed = 4.0;
  if (difficulty === 'hard') speed = 3.5;
  if (difficulty === 'expert') speed = 3.0;

  let hours = lengthKm / speed;
  if (elevationGainM != null) hours += elevationGainM / 600;
  return Number(hours.toFixed(2));
}

export type TrailInsertRow = {
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

export function makeTrailKey(name: string, location: string) {
  return `${String(name || '').trim().toLowerCase()}||${String(location || '')
    .trim()
    .toLowerCase()}`;
}

export async function loadExistingTrailKeys(client: any) {
  const result = await client.query(`
    SELECT lower(name) AS name, lower(location) AS location
    FROM trails
  `);

  const keys = new Set<string>();
  for (const row of result.rows) {
    keys.add(makeTrailKey(row.name, row.location));
  }
  return keys;
}

export async function insertTrail(client: any, row: TrailInsertRow) {
  const sql = `
    INSERT INTO trails (
      name,
      region,
      location,
      length_km,
      elevation_gain_m,
      difficulty,
      terrain,
      scenery,
      description,
      highlights,
      estimated_duration_hours,
      popularity_score,
      rating,
      review_count,
      image_url,
      start_point,
      tags
    )
    VALUES (
      $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17
    )
    RETURNING id, name
  `;

  return client.query(sql, [
    row.name,
    row.region,
    row.location,
    row.lengthKm,
    row.elevationGainM,
    row.difficulty,
    row.terrain,
    row.scenery,
    row.description,
    row.highlights,
    row.estimatedDurationHours,
    row.popularityScore,
    row.rating,
    row.reviewCount,
    row.imageUrl,
    row.startPoint,
    row.tags,
  ]);
}

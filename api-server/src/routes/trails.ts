import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { trailsTable } from "@workspace/db/schema";
import { eq, ilike, gte, lte, and, sql, or } from "drizzle-orm";
import {
  ListTrailsQueryParams,
  GetTrailParams,
  GetFilterOptionsResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();

function parseTrail(t: typeof trailsTable.$inferSelect) {
  let tags: string[] = [];
  try {
    tags = JSON.parse(t.tags);
  } catch {
    tags = [];
  }
  return {
    ...t,
    tags,
    imageUrl: t.imageUrl ?? null,
  };
}

router.get("/trails", async (req: Request, res: Response) => {
  try {
    const query = ListTrailsQueryParams.parse(req.query);
    const limit = query.limit ?? 20;
    const offset = query.offset ?? 0;

    const conditions = [];

    if (query.search) {
      conditions.push(
        or(
          ilike(trailsTable.name, `%${query.search}%`),
          ilike(trailsTable.location, `%${query.search}%`),
          ilike(trailsTable.region, `%${query.search}%`),
          ilike(trailsTable.description, `%${query.search}%`)
        )
      );
    }

    if (query.difficulty) {
      conditions.push(eq(trailsTable.difficulty, query.difficulty));
    }

    if (query.terrain) {
      conditions.push(
        or(
          ilike(trailsTable.terrain, `%${query.terrain}%`),
          ilike(trailsTable.tags, `%${query.terrain}%`),
        ),
      );
    }

    if (query.region) {
      conditions.push(ilike(trailsTable.region, `%${query.region}%`));
    }

    if (query.scenery) {
      conditions.push(ilike(trailsTable.scenery, `%${query.scenery}%`));
    }

    if (query.minLength !== undefined) {
      conditions.push(gte(trailsTable.lengthKm, query.minLength));
    }

    if (query.maxLength !== undefined) {
      conditions.push(lte(trailsTable.lengthKm, query.maxLength));
    }

    if (query.minElevation !== undefined) {
      conditions.push(gte(trailsTable.elevationGainM, query.minElevation));
    }

    if (query.maxElevation !== undefined) {
      conditions.push(lte(trailsTable.elevationGainM, query.maxElevation));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [trails, countResult] = await Promise.all([
      db
        .select()
        .from(trailsTable)
        .where(whereClause)
        .orderBy(sql`${trailsTable.popularityScore} DESC`)
        .limit(limit)
        .offset(offset),
      db
        .select({ count: sql<number>`count(*)` })
        .from(trailsTable)
        .where(whereClause),
    ]);

    res.json({
      trails: trails.map(parseTrail),
      total: Number(countResult[0]?.count ?? 0),
      offset,
      limit,
    });
  } catch (err) {
    console.error("Error listing trails:", err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch trails" });
  }
});

router.get("/trails/:id", async (req: Request, res: Response) => {
  try {
    const params = GetTrailParams.parse({ id: req.params.id });
    const trail = await db
      .select()
      .from(trailsTable)
      .where(eq(trailsTable.id, params.id))
      .limit(1);

    if (!trail.length) {
      res.status(404).json({ error: "not_found", message: "Trail not found" });
      return;
    }

    res.json(parseTrail(trail[0]));
  } catch (err) {
    console.error("Error getting trail:", err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch trail" });
  }
});

router.get("/filters/options", async (_req: Request, res: Response) => {
  try {
    const [regions, terrains, sceneryTypes] = await Promise.all([
      db.selectDistinct({ region: trailsTable.region }).from(trailsTable).orderBy(trailsTable.region),
      db.selectDistinct({ terrain: trailsTable.terrain }).from(trailsTable).orderBy(trailsTable.terrain),
      db.selectDistinct({ scenery: trailsTable.scenery }).from(trailsTable).orderBy(trailsTable.scenery),
    ]);

    const result = GetFilterOptionsResponse.parse({
      regions: regions.map((r) => r.region),
      terrains: terrains.map((t) => t.terrain),
      sceneryTypes: sceneryTypes.map((s) => s.scenery),
      difficulties: ["easy", "moderate", "hard", "expert"],
    });

    res.json(result);
  } catch (err) {
    console.error("Error fetching filter options:", err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch filter options" });
  }
});

export default router;

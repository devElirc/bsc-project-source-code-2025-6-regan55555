import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { trailsTable, hikingHistoryTable, userPreferencesTable } from "@workspace/db/schema";
import { eq, sql, and, ne } from "drizzle-orm";
import { GetRecommendationsQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();

const DIFFICULTY_ORDER: Record<string, number> = {
  easy: 1,
  moderate: 2,
  hard: 3,
  expert: 4,
};

function difficultyDistance(a: string, b: string): number {
  return Math.abs((DIFFICULTY_ORDER[a] ?? 2) - (DIFFICULTY_ORDER[b] ?? 2));
}

function computeContentScore(
  trail: typeof trailsTable.$inferSelect,
  prefs: {
    preferredDifficulty?: string | null;
    preferredTerrain?: string | null;
    preferredLength?: number | null;
    preferredScenery?: string | null;
  }
): number {
  let score = 0;

  // Difficulty match (max 30 pts)
  if (prefs.preferredDifficulty) {
    const dist = difficultyDistance(trail.difficulty, prefs.preferredDifficulty);
    score += Math.max(0, 30 - dist * 10);
  } else {
    score += 15; // neutral
  }

  // Terrain match (max 25 pts)
  if (prefs.preferredTerrain) {
    if (trail.terrain.toLowerCase().includes(prefs.preferredTerrain.toLowerCase())) {
      score += 25;
    } else {
      score += 5;
    }
  } else {
    score += 12;
  }

  // Length match (max 25 pts)
  if (prefs.preferredLength) {
    const diff = Math.abs(trail.lengthKm - prefs.preferredLength);
    score += Math.max(0, 25 - diff * 1.5);
  } else {
    score += 12;
  }

  // Scenery match (max 10 pts)
  if (prefs.preferredScenery) {
    if (trail.scenery.toLowerCase().includes(prefs.preferredScenery.toLowerCase())) {
      score += 10;
    }
  } else {
    score += 5;
  }

  // Popularity boost (max 10 pts)
  score += (trail.popularityScore / 100) * 10;

  return score;
}

function getReason(
  trail: typeof trailsTable.$inferSelect,
  prefs: {
    preferredDifficulty?: string | null;
    preferredTerrain?: string | null;
    preferredLength?: number | null;
    historyDifficulties?: string[];
    hasHistory?: boolean;
  }
): string {
  const reasons: string[] = [];

  if (prefs.hasHistory && prefs.historyDifficulties?.includes(trail.difficulty)) {
    reasons.push(`Matches your ${trail.difficulty} difficulty history`);
  }

  if (prefs.preferredDifficulty && trail.difficulty === prefs.preferredDifficulty) {
    reasons.push(`Perfect ${trail.difficulty} difficulty match`);
  }

  if (prefs.preferredTerrain && trail.terrain.toLowerCase().includes(prefs.preferredTerrain.toLowerCase())) {
    reasons.push(`${trail.terrain} terrain matches your preference`);
  }

  if (prefs.preferredLength) {
    const diff = Math.abs(trail.lengthKm - prefs.preferredLength);
    if (diff <= 3) {
      reasons.push(`Length (${trail.lengthKm}km) close to your preferred ${prefs.preferredLength}km`);
    }
  }

  if (trail.popularityScore >= 80) {
    reasons.push("Highly popular trail");
  }

  if (trail.rating >= 4.5) {
    reasons.push(`Top rated (${trail.rating}★)`);
  }

  if (reasons.length === 0) {
    return "Recommended based on overall quality";
  }

  return reasons[0];
}

router.get("/recommendations", async (req: Request, res: Response) => {
  try {
    const query = GetRecommendationsQueryParams.parse(req.query);
    const limit = query.limit ?? 6;

    let strategy = "popularity";
    let historyDifficulties: string[] = [];
    let hasHistory = false;

    let prefs = {
      preferredDifficulty: query.preferredDifficulty ?? null,
      preferredTerrain: query.preferredTerrain ?? null,
      preferredLength: query.preferredLength ?? null,
      preferredScenery: null as string | null,
    };

    // Load user preferences and history from DB if userId given
    if (query.userId) {
      const [userPrefs, userHistory] = await Promise.all([
        db
          .select()
          .from(userPreferencesTable)
          .where(eq(userPreferencesTable.userId, query.userId))
          .limit(1),
        db
          .select({ trailId: hikingHistoryTable.trailId })
          .from(hikingHistoryTable)
          .where(eq(hikingHistoryTable.userId, query.userId)),
      ]);

      if (userPrefs.length) {
        const p = userPrefs[0];
        const pd = p.preferredDifficulty;
        const safeDifficulty =
          pd === "easy" || pd === "moderate" || pd === "hard" || pd === "expert" ? pd : null;
        prefs.preferredDifficulty = prefs.preferredDifficulty ?? safeDifficulty;
        prefs.preferredTerrain = prefs.preferredTerrain ?? p.preferredTerrain;
        prefs.preferredLength =
          prefs.preferredLength ??
          (p.preferredMinLengthKm && p.preferredMaxLengthKm
            ? (p.preferredMinLengthKm + p.preferredMaxLengthKm) / 2
            : null);
        prefs.preferredScenery = p.preferredScenery;
      }

      // Get difficulty profile from history
      if (userHistory.length > 0) {
        hasHistory = true;
        strategy = "content-based + history";
        const historyTrailIds = userHistory.map((h) => h.trailId);

        // Find what difficulties the user has historically done
        if (historyTrailIds.length > 0) {
          const completedTrails = await db
            .select({ difficulty: trailsTable.difficulty })
            .from(trailsTable)
            .where(
              sql`${trailsTable.id} = ANY(ARRAY[${sql.join(historyTrailIds.map((id) => sql`${id}`), sql`, `)}]::int[])`
            );
          historyDifficulties = [...new Set(completedTrails.map((t) => t.difficulty))];
        }
      } else if (prefs.preferredDifficulty || prefs.preferredTerrain) {
        strategy = "content-based preferences";
      }
    } else if (prefs.preferredDifficulty || prefs.preferredTerrain) {
      strategy = "content-based preferences";
    }

    // Get all trails to score
    const allTrails = await db
      .select()
      .from(trailsTable)
      .orderBy(sql`${trailsTable.popularityScore} DESC`)
      .limit(100);

    // Score each trail
    const scored = allTrails.map((trail) => {
      let score = computeContentScore(trail, prefs);

      // History bonus — prefer similar difficulties to what user has done
      if (hasHistory && historyDifficulties.length > 0) {
        if (historyDifficulties.includes(trail.difficulty)) {
          score += 15;
        }
      }

      return {
        trail,
        score,
        reason: getReason(trail, { ...prefs, historyDifficulties, hasHistory }),
      };
    });

    // Sort by score descending, take top N
    scored.sort((a, b) => b.score - a.score);
    const top = scored.slice(0, limit);

    let tags: string[] = [];
    const recommendations = top.map(({ trail, score, reason }) => {
      try {
        tags = JSON.parse(trail.tags);
      } catch {
        tags = [];
      }
      return {
        trail: { ...trail, tags, imageUrl: trail.imageUrl ?? null },
        score: Math.round(score),
        reason,
      };
    });

    res.json({ recommendations, strategy });
  } catch (err) {
    console.error("Error getting recommendations:", err);
    res.status(500).json({ error: "internal_error", message: "Failed to compute recommendations" });
  }
});

export default router;

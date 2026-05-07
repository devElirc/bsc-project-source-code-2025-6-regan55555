import { Router, type IRouter, type Request, type Response } from "express";
import { db } from "@workspace/db";
import { hikingHistoryTable, userPreferencesTable, trailsTable } from "@workspace/db/schema";
import { eq, and, sql } from "drizzle-orm";
import {
  AddUserHistoryBody,
  AddUserHistoryParams,
  GetUserHistoryParams,
  GetUserPreferencesParams,
  UpdateUserPreferencesBody,
  UpdateUserPreferencesParams,
} from "@workspace/api-zod";

const router: IRouter = Router();

// GET /users/:userId/history
router.get("/users/:userId/history", async (req: Request, res: Response) => {
  try {
    const params = GetUserHistoryParams.parse({ userId: req.params.userId });

    const historyRows = await db
      .select({
        id: hikingHistoryTable.id,
        userId: hikingHistoryTable.userId,
        trailId: hikingHistoryTable.trailId,
        completedAt: hikingHistoryTable.completedAt,
        rating: hikingHistoryTable.rating,
        notes: hikingHistoryTable.notes,
        trailName: trailsTable.name,
        difficulty: trailsTable.difficulty,
        terrain: trailsTable.terrain,
        lengthKm: trailsTable.lengthKm,
        imageUrl: trailsTable.imageUrl,
        startPoint: trailsTable.startPoint,
      })
      .from(hikingHistoryTable)
      .leftJoin(trailsTable, eq(hikingHistoryTable.trailId, trailsTable.id))
      .where(eq(hikingHistoryTable.userId, params.userId))
      .orderBy(sql`${hikingHistoryTable.completedAt} DESC`);

    const totalKm = historyRows.reduce((sum, h) => sum + (h.lengthKm ?? 0), 0);

    const history = historyRows.map((h) => ({
      id: h.id,
      userId: h.userId,
      trailId: h.trailId,
      trailName: h.trailName ?? "Unknown Trail",
      completedAt: h.completedAt?.toISOString() ?? new Date().toISOString(),
      rating: h.rating ?? null,
      notes: h.notes ?? null,
      difficulty: h.difficulty ?? "moderate",
      terrain: h.terrain ?? "mixed",
      lengthKm: h.lengthKm ?? 0,
      imageUrl: h.imageUrl ?? null,
      startPoint: h.startPoint ?? null,
    }));

    res.json({
      userId: params.userId,
      history,
      totalCompleted: history.length,
      totalKm: Math.round(totalKm * 10) / 10,
    });
  } catch (err) {
    console.error("Error getting user history:", err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch user history" });
  }
});

// POST /users/:userId/history
router.post("/users/:userId/history", async (req: Request, res: Response) => {
  try {
    const params = AddUserHistoryParams.parse({ userId: req.params.userId });
    const body = AddUserHistoryBody.parse(req.body);

    // Verify trail exists
    const trail = await db
      .select()
      .from(trailsTable)
      .where(eq(trailsTable.id, body.trailId))
      .limit(1);

    if (!trail.length) {
      res.status(404).json({ error: "not_found", message: "Trail not found" });
      return;
    }

    const completedAt = body.completedAt ? new Date(body.completedAt) : new Date();

    const [entry] = await db
      .insert(hikingHistoryTable)
      .values({
        userId: params.userId,
        trailId: body.trailId,
        completedAt,
        rating: body.rating ?? null,
        notes: body.notes ?? null,
      })
      .returning();

    const t = trail[0];
    res.status(201).json({
      id: entry.id,
      userId: entry.userId,
      trailId: entry.trailId,
      trailName: t.name,
      completedAt: entry.completedAt?.toISOString() ?? completedAt.toISOString(),
      rating: entry.rating ?? null,
      notes: entry.notes ?? null,
      difficulty: t.difficulty,
      terrain: t.terrain,
      lengthKm: t.lengthKm,
    });
  } catch (err) {
    console.error("Error adding user history:", err);
    res.status(500).json({ error: "internal_error", message: "Failed to add history entry" });
  }
});

// GET /users/:userId/preferences
router.get("/users/:userId/preferences", async (req: Request, res: Response) => {
  try {
    const params = GetUserPreferencesParams.parse({ userId: req.params.userId });

    const prefs = await db
      .select()
      .from(userPreferencesTable)
      .where(eq(userPreferencesTable.userId, params.userId))
      .limit(1);

    if (!prefs.length) {
      // Return empty prefs for new users
      res.json({
        userId: params.userId,
        preferredDifficulty: null,
        preferredTerrain: null,
        preferredMinLengthKm: null,
        preferredMaxLengthKm: null,
        preferredScenery: null,
        fitnessLevel: null,
      });
      return;
    }

    const p = prefs[0];
    res.json({
      userId: p.userId,
      preferredDifficulty: p.preferredDifficulty ?? null,
      preferredTerrain: p.preferredTerrain ?? null,
      preferredMinLengthKm: p.preferredMinLengthKm ?? null,
      preferredMaxLengthKm: p.preferredMaxLengthKm ?? null,
      preferredScenery: p.preferredScenery ?? null,
      fitnessLevel: p.fitnessLevel ?? null,
    });
  } catch (err) {
    console.error("Error getting user preferences:", err);
    res.status(500).json({ error: "internal_error", message: "Failed to fetch preferences" });
  }
});

// PUT /users/:userId/preferences
router.put("/users/:userId/preferences", async (req: Request, res: Response) => {
  try {
    const params = UpdateUserPreferencesParams.parse({ userId: req.params.userId });
    const body = UpdateUserPreferencesBody.parse(req.body);

    // Upsert preferences
    const existing = await db
      .select()
      .from(userPreferencesTable)
      .where(eq(userPreferencesTable.userId, params.userId))
      .limit(1);

    let result;
    if (existing.length) {
      [result] = await db
        .update(userPreferencesTable)
        .set({
          preferredDifficulty: body.preferredDifficulty ?? null,
          preferredTerrain: body.preferredTerrain ?? null,
          preferredMinLengthKm: body.preferredMinLengthKm ?? null,
          preferredMaxLengthKm: body.preferredMaxLengthKm ?? null,
          preferredScenery: body.preferredScenery ?? null,
          fitnessLevel: body.fitnessLevel ?? null,
          updatedAt: new Date(),
        })
        .where(eq(userPreferencesTable.userId, params.userId))
        .returning();
    } else {
      [result] = await db
        .insert(userPreferencesTable)
        .values({
          userId: params.userId,
          preferredDifficulty: body.preferredDifficulty ?? null,
          preferredTerrain: body.preferredTerrain ?? null,
          preferredMinLengthKm: body.preferredMinLengthKm ?? null,
          preferredMaxLengthKm: body.preferredMaxLengthKm ?? null,
          preferredScenery: body.preferredScenery ?? null,
          fitnessLevel: body.fitnessLevel ?? null,
        })
        .returning();
    }

    res.json({
      userId: result.userId,
      preferredDifficulty: result.preferredDifficulty ?? null,
      preferredTerrain: result.preferredTerrain ?? null,
      preferredMinLengthKm: result.preferredMinLengthKm ?? null,
      preferredMaxLengthKm: result.preferredMaxLengthKm ?? null,
      preferredScenery: result.preferredScenery ?? null,
      fitnessLevel: result.fitnessLevel ?? null,
    });
  } catch (err) {
    console.error("Error updating preferences:", err);
    res.status(500).json({ error: "internal_error", message: "Failed to update preferences" });
  }
});

export default router;

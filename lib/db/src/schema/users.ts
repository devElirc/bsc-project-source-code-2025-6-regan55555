import { pgTable, text, serial, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { trailsTable } from "./trails";

export const userPreferencesTable = pgTable("user_preferences", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull().unique(),
  preferredDifficulty: text("preferred_difficulty"),
  preferredTerrain: text("preferred_terrain"),
  preferredMinLengthKm: real("preferred_min_length_km"),
  preferredMaxLengthKm: real("preferred_max_length_km"),
  preferredScenery: text("preferred_scenery"),
  fitnessLevel: text("fitness_level"),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const hikingHistoryTable = pgTable("hiking_history", {
  id: serial("id").primaryKey(),
  userId: text("user_id").notNull(),
  trailId: serial("trail_id").references(() => trailsTable.id),
  completedAt: timestamp("completed_at").defaultNow(),
  rating: real("rating"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertUserPreferencesSchema = createInsertSchema(userPreferencesTable).omit({ id: true, updatedAt: true });
export const insertHikingHistorySchema = createInsertSchema(hikingHistoryTable).omit({ id: true, createdAt: true });

export type InsertUserPreferences = z.infer<typeof insertUserPreferencesSchema>;
export type UserPreferences = typeof userPreferencesTable.$inferSelect;
export type InsertHikingHistory = z.infer<typeof insertHikingHistorySchema>;
export type HikingHistory = typeof hikingHistoryTable.$inferSelect;

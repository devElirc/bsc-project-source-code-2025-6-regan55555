import { pgTable, text, serial, real, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const trailsTable = pgTable("trails", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  region: text("region").notNull(),
  location: text("location").notNull(),
  lengthKm: real("length_km").notNull(),
  elevationGainM: real("elevation_gain_m").notNull(),
  difficulty: text("difficulty").notNull(), // easy, moderate, hard, expert
  terrain: text("terrain").notNull(),
  scenery: text("scenery").notNull(),
  description: text("description").notNull(),
  highlights: text("highlights").notNull(),
  estimatedDurationHours: real("estimated_duration_hours").notNull(),
  popularityScore: real("popularity_score").notNull().default(50),
  rating: real("rating").notNull().default(4.0),
  reviewCount: integer("review_count").notNull().default(0),
  imageUrl: text("image_url"),
  startPoint: text("start_point").notNull(),
  tags: text("tags").notNull().default("[]"), // JSON array stored as text
  createdAt: timestamp("created_at").defaultNow(),
});

export const insertTrailSchema = createInsertSchema(trailsTable).omit({ id: true, createdAt: true });
export type InsertTrail = z.infer<typeof insertTrailSchema>;
export type Trail = typeof trailsTable.$inferSelect;

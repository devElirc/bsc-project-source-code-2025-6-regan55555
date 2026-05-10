import path from "node:path";
import process from "node:process";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

type Recommendation = {
  trail: { name: string };
  score: number;
  reason: string;
};

type RecommendationsResponse = {
  recommendations: Recommendation[];
  strategy: string;
};

function interpretationFromReason(reason: string, strategy: string): string {
  const r = reason.toLowerCase();
  if (r.includes("history")) return "Likely influenced by hiking history (history bonus).";
  if (r.includes("popular")) return "Popularity signal likely influenced ranking.";
  if (r.includes("difficulty")) return "Matches preferred difficulty (content-based scoring).";
  if (r.includes("terrain")) return "Matches preferred terrain (content-based scoring).";
  if (r.includes("length")) return "Length close to preference (content-based scoring).";
  if (strategy.toLowerCase().includes("popularity")) return "No user prefs/history → popularity baseline.";
  return "Plausible recommendation given available preference signals.";
}

async function main() {
  const base = (process.env.API_BASE_URL || "http://localhost:5000").replace(/\/+$/, "");

  const params: Record<string, unknown> = {
    limit: Number(process.env.RECO_LIMIT || 3),
  };

  const userId = process.env.RECO_USER_ID?.trim();
  if (userId) params.userId = userId;

  const d = process.env.RECO_PREFERRED_DIFFICULTY?.trim();
  if (d) params.preferredDifficulty = d;

  const t = process.env.RECO_PREFERRED_TERRAIN?.trim();
  if (t) params.preferredTerrain = t;

  const lenRaw = process.env.RECO_PREFERRED_LENGTH?.trim();
  if (lenRaw) params.preferredLength = Number(lenRaw);

  const r = await axios.get<RecommendationsResponse>(`${base}/api/recommendations`, {
    params,
    validateStatus: () => true,
    timeout: 30000,
  });

  if (r.status < 200 || r.status >= 300) {
    throw new Error(`GET /api/recommendations failed: HTTP ${r.status} ${JSON.stringify(r.data)?.slice(0, 200)}`);
  }

  const body = r.data;
  const top = body.recommendations.slice(0, 3);

  console.log("=== Table 8.9 — Recommendation worked example (real output) ===");
  console.log(`Strategy: ${body.strategy}`);
  console.log(`Query params: ${JSON.stringify(params)}`);
  console.log("");
  console.log("| Rank | Trail name | Score | Reason returned by API | Interpretation |");
  console.log("|---:|---|---:|---|---|");

  top.forEach((rec, i) => {
    const interp = interpretationFromReason(rec.reason || "", body.strategy || "");
    const safeReason = String(rec.reason || "").replace(/\|/g, "\\|");
    console.log(`| ${i + 1} | ${rec.trail?.name ?? "(unknown)"} | ${rec.score} | ${safeReason} | ${interp} |`);
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import axios from "axios";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

const apiBaseUrl = process.env.API_BASE_URL?.trim() || "http://localhost:5000";
const base = apiBaseUrl.replace(/\/+$/, "");
const nRepeats = Math.max(2, Number(process.env.PERF_N || 30));
const phase = (process.env.PERF_PHASE || "trails").trim().toLowerCase() as "all" | "trails" | "discover";
const discoverText =
  process.env.PERF_DISCOVER_TEXT?.trim() ||
  "Expert coastal trail under 55 km in South England Coast";

type SmokeRow = {
  endpoint: string;
  condition: string;
  n: number;
  meanMs: number;
  stdMs: number;
  notes: string;
};

function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** Sample standard deviation (divide by n-1). */
function stdSample(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / (xs.length - 1);
  return Math.sqrt(v);
}

async function measureHttpMs(doReq: () => Promise<unknown>): Promise<number> {
  const t0 = performance.now();
  await doReq();
  return performance.now() - t0;
}

async function smokeScenario(opts: {
  endpointLabel: string;
  condition: string;
  notes: string;
  runWarmup: () => Promise<unknown>;
  runTimed: () => Promise<unknown>;
}): Promise<SmokeRow> {
  await opts.runWarmup();
  const samples: number[] = [];
  for (let i = 0; i < nRepeats; i++) {
    samples.push(await measureHttpMs(opts.runTimed));
  }
  return {
    endpoint: opts.endpointLabel,
    condition: opts.condition,
    n: nRepeats,
    meanMs: Math.round(mean(samples)),
    stdMs: Math.round(stdSample(samples) * 10) / 10,
    notes: opts.notes,
  };
}

async function trailRowCount(): Promise<number | null> {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  const client = new pg.Client({ connectionString: url });
  try {
    await client.connect();
    const r = await client.query<{ n: number }>("SELECT COUNT(*)::int AS n FROM trails");
    return r.rows[0]?.n ?? null;
  } catch {
    return null;
  } finally {
    await client.end().catch(() => {});
  }
}

function parseDiscoverExpected(): "openai" | "rules" | null {
  const raw = process.env.DISCOVER_EXPECT_SOURCE?.trim().toLowerCase();
  if (raw === "openai" || raw === "rules") return raw;
  return null;
}

async function main() {
  const discoverExpected = parseDiscoverExpected();
  const includeTrails = phase === "all" || phase === "trails";
  const includeDiscover = phase === "all" || phase === "discover";

  if (includeDiscover && !discoverExpected) {
    console.error(
      "Set DISCOVER_EXPECT_SOURCE=rules or openai when PERF_PHASE includes discover (use PERF_PHASE=trails for GET-only).",
    );
    process.exit(1);
  }

  const rows: SmokeRow[] = [];

  if (includeTrails) {
    const assertOk = (status: number, label: string) => {
      if (status < 200 || status >= 300) throw new Error(`${label} failed: HTTP ${status}`);
    };

    rows.push(
      await smokeScenario({
        endpointLabel: "GET /api/trails",
        condition: "Default query",
        notes: "Uses current trail dataset.",
        runWarmup: async () => {
          const r = await axios.get(`${base}/api/trails`, {
            params: { limit: 20, offset: 0 },
            validateStatus: () => true,
          });
          assertOk(r.status, "GET /api/trails default");
        },
        runTimed: async () => {
          const r = await axios.get(`${base}/api/trails`, {
            params: { limit: 20, offset: 0 },
            validateStatus: () => true,
          });
          assertOk(r.status, "GET /api/trails default");
        },
      }),
    );

    rows.push(
      await smokeScenario({
        endpointLabel: "GET /api/trails",
        condition: "Heavy filter combination",
        notes: "difficulty=expert, terrain=coastal, maxLength=55",
        runWarmup: async () => {
          const r = await axios.get(`${base}/api/trails`, {
            params: {
              limit: 20,
              offset: 0,
              difficulty: "expert",
              terrain: "coastal",
              maxLength: 55,
            },
            validateStatus: () => true,
          });
          assertOk(r.status, "GET /api/trails heavy");
        },
        runTimed: async () => {
          const r = await axios.get(`${base}/api/trails`, {
            params: {
              limit: 20,
              offset: 0,
              difficulty: "expert",
              terrain: "coastal",
              maxLength: 55,
            },
            validateStatus: () => true,
          });
          assertOk(r.status, "GET /api/trails heavy");
        },
      }),
    );
  }

  if (includeDiscover && discoverExpected) {
    const modeNote =
      discoverExpected === "rules"
        ? "No external LLM request."
        : "Includes external provider round-trip time.";

    rows.push(
      await smokeScenario({
        endpointLabel: "POST /api/ai/discover-parse",
        condition:
          discoverExpected === "rules" ? "Rules-only mode" : "LLM-enabled mode",
        notes: modeNote,
        runWarmup: async () => {
          const r = await axios.post(
            `${base}/api/ai/discover-parse`,
            { text: discoverText },
            { validateStatus: () => true },
          );
          if (r.status < 200 || r.status >= 300) {
            throw new Error(`Warmup POST /api/ai/discover-parse failed: HTTP ${r.status}`);
          }
          const src = (r.data as { source?: string })?.source;
          if (src !== discoverExpected) {
            throw new Error(
              `Warmup: expected source=${discoverExpected}, got ${String(src)} — fix server env or DISCOVER_EXPECT_SOURCE.`,
            );
          }
        },
        runTimed: async () => {
          const r = await axios.post(
            `${base}/api/ai/discover-parse`,
            { text: discoverText },
            {
              validateStatus: () => true,
              timeout: Number(process.env.PERF_DISCOVER_TIMEOUT_MS || 120000),
            },
          );
          if (r.status < 200 || r.status >= 300) {
            throw new Error(`POST /api/ai/discover-parse failed: HTTP ${r.status}`);
          }
          const src = (r.data as { source?: string })?.source;
          if (src !== discoverExpected) {
            throw new Error(
              `Expected source=${discoverExpected}, got ${String(src)} — server configuration mismatch.`,
            );
          }
        },
      }),
    );
  }

  const trailCount = await trailRowCount();

  const envRecord = {
    node: process.version,
    platform: `${os.type()} ${os.release()}`,
    cpus: os.cpus()[0]?.model ?? "unknown",
    ramBytes: os.totalmem(),
    ramGb: Math.round((os.totalmem() / 1024 ** 3) * 10) / 10,
    trailRowCount: trailCount,
    apiBaseUrl: base,
    perfPhase: phase,
    discoverExpectedSource: discoverExpected,
    perfN: nRepeats,
  };

  const outDir = path.resolve(process.cwd(), "eval", "out");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = path.join(outDir, `perf-smoke_${phase}_${discoverExpected ?? "notraces"}_${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify({ environment: envRecord, tableRows: rows }, null, 2), "utf-8");

  console.log("=== Table 7.17 — Performance smoke test (paste into dissertation) ===\n");
  console.log(
    "| Endpoint | Condition | N | Mean (ms) | Std dev (ms) | Notes |\n|---|---|---:|---:|---:|---|",
  );
  for (const r of rows) {
    console.log(
      `| ${r.endpoint} | ${r.condition} | ${r.n} | ${r.meanMs} | ${r.stdMs} | ${r.notes} |`,
    );
  }
  console.log("\n=== Environment (§7.8.1 item 6) ===");
  console.log(JSON.stringify(envRecord, null, 2));
  console.log(`\nSaved: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

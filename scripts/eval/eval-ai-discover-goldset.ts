import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import axios from "axios";
import dotenv from "dotenv";

type ExpectedStringRule =
  | string
  | { contains: string }
  | { anyOf: string[] }
  | { anyOfContains: string[] };

type ExpectedNumberRule = number | { min?: number; max?: number };

type ExpectedRule = ExpectedStringRule | ExpectedNumberRule;

type CaseScoring = "strict" | "minimal_acceptable_only";

type GoldCase = {
  id: string;
  text: string;
  category: string;
  expected?: Record<string, ExpectedRule>;
  scoring?: CaseScoring;
};

type GoldSetFile = {
  title?: string;
  notes?: string[];
  categoriesOrder?: string[];
  cases: GoldCase[];
};

type DiscoverParseResponse = {
  filters: Record<string, unknown>;
  summary?: string;
  source?: "openai" | "rules";
};

type Outcome = "exact" | "partial" | "safe_degrade" | "fail" | "unscored";

const TABLE_86_ORDER = [
  "Difficulty only",
  "Length upper bound",
  "Length lower bound",
  "Region or place",
  "Terrain or scenery",
  "Combined constraints",
  "Ambiguous or vague input",
  "Edge cases",
];

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function normString(s: string): string {
  return s.trim().toLowerCase();
}

function cleanFilters(filters: Record<string, unknown>): Record<string, unknown> {
  const allowed = new Set([
    "search",
    "difficulty",
    "terrain",
    "minLength",
    "maxLength",
    "minElevation",
    "maxElevation",
    "region",
    "scenery",
    "limit",
    "offset",
  ]);

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(filters)) {
    if (!allowed.has(k)) continue;
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && !v.trim()) continue;
    out[k] = v;
  }
  return out;
}

function matchExpected(actualValue: unknown, rule: ExpectedRule): boolean {
  if (typeof rule === "number") return actualValue === rule;

  if (typeof rule === "string") {
    return typeof actualValue === "string" && normString(actualValue) === normString(rule);
  }

  if (isRecord(rule)) {
    if ("contains" in rule) {
      return typeof actualValue === "string" && normString(actualValue).includes(normString(String(rule.contains)));
    }
    if ("anyOf" in rule) {
      return (
        typeof actualValue === "string" &&
        rule.anyOf.some((x) => normString(actualValue) === normString(String(x)))
      );
    }
    if ("anyOfContains" in rule) {
      return (
        typeof actualValue === "string" &&
        rule.anyOfContains.some((x) => normString(actualValue).includes(normString(String(x))))
      );
    }
    if ("min" in rule || "max" in rule) {
      if (typeof actualValue !== "number") return false;
      if (typeof rule.min === "number" && actualValue < rule.min) return false;
      if (typeof rule.max === "number" && actualValue > rule.max) return false;
      return true;
    }
  }

  return false;
}

function classifyStrict(actualRaw: Record<string, unknown>, expected?: Record<string, ExpectedRule>): Outcome {
  if (!expected) return "unscored";
  const actual = cleanFilters(actualRaw);
  const expectedEntries = Object.entries(expected);
  if (expectedEntries.length === 0) return "unscored";

  let matches = 0;
  let mismatches = 0;

  for (const [k, rule] of expectedEntries) {
    if (!(k in actual)) continue;
    if (matchExpected(actual[k], rule)) matches += 1;
    else mismatches += 1;
  }

  const hasContradiction = mismatches > 0;

  if (hasContradiction) return "fail";
  if (matches === expectedEntries.length) return "exact";
  if (matches > 0) return "partial";

  const meaningfulKeys = Object.keys(actual).filter((k) => k !== "limit" && k !== "offset");
  if (meaningfulKeys.length === 0) return "safe_degrade";

  return "safe_degrade";
}

/** For vague utterances: empty filters or only a text search fallback is acceptable (no contradictory structure). */
function classifyMinimal(actualRaw: Record<string, unknown>): Outcome {
  const actual = cleanFilters(actualRaw);
  const keys = Object.keys(actual).filter((k) => k !== "limit" && k !== "offset");
  if (keys.length === 0) return "exact";
  if (keys.length === 1 && keys[0] === "search" && typeof actual.search === "string") return "exact";
  return "partial";
}

function classifyCase(c: GoldCase, filters: Record<string, unknown>): Outcome {
  const scoring: CaseScoring = c.scoring ?? "strict";
  if (scoring === "minimal_acceptable_only") return classifyMinimal(filters);
  return classifyStrict(filters, c.expected);
}

function nowStamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}_${pad(d.getHours())}${pad(
    d.getMinutes(),
  )}${pad(d.getSeconds())}`;
}

type Aggregate = { utterancesTested: number; exact: number; partial: number; safe_degrade: number; fail: number };

function emptyAgg(): Aggregate {
  return { utterancesTested: 0, exact: 0, partial: 0, safe_degrade: 0, fail: 0 };
}

function getAgg(map: Map<string, Aggregate>, cat: string): Aggregate {
  let a = map.get(cat);
  if (!a) {
    a = emptyAgg();
    map.set(cat, a);
  }
  return a;
}

function addOutcome(a: Aggregate, o: Exclude<Outcome, "unscored">) {
  a.utterancesTested += 1;
  if (o === "exact") a.exact += 1;
  else if (o === "partial") a.partial += 1;
  else if (o === "safe_degrade") a.safe_degrade += 1;
  else if (o === "fail") a.fail += 1;
}

async function main() {
  dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

  const apiBaseUrl = process.env.API_BASE_URL?.trim() || "http://localhost:5000";
  const endpoint = `${apiBaseUrl.replace(/\/+$/, "")}/api/ai/discover-parse`;
  const runLabel = process.env.RUN_LABEL?.trim() || "unspecified";

  const goldPath =
    process.env.GOLDSET_PATH?.trim() ||
    path.resolve(process.cwd(), "eval", "goldsets", "ai-discover-goldset.json");

  const raw = fs.readFileSync(goldPath, "utf-8");
  const gold = JSON.parse(raw) as GoldSetFile;
  if (!gold.cases?.length) throw new Error(`No cases found in ${goldPath}`);

  const order = gold.categoriesOrder?.length ? gold.categoriesOrder : TABLE_86_ORDER;

  const byCategory = new Map<string, Aggregate>();
  for (const row of TABLE_86_ORDER) byCategory.set(row, emptyAgg());
  // Any extra category strings from JSON
  for (const c of gold.cases) {
    if (!byCategory.has(c.category)) byCategory.set(c.category, emptyAgg());
  }

  let exact = 0;
  let partial = 0;
  let safeDegrade = 0;
  let fail = 0;

  const results: Array<{
    id: string;
    category?: string;
    text: string;
    expected?: Record<string, ExpectedRule>;
    scoring?: CaseScoring;
    outcome: Outcome;
    httpStatus?: number;
    source?: "openai" | "rules";
    filters?: Record<string, unknown>;
    summary?: string;
    error?: string;
    elapsedMs: number;
  }> = [];

  for (const c of gold.cases) {
    const start = Date.now();
    try {
      const r = await axios.post<DiscoverParseResponse>(
        endpoint,
        { text: c.text },
        {
          timeout: Number(process.env.AI_DISCOVER_TIMEOUT_MS || 120000),
          validateStatus: () => true,
        },
      );

      const elapsedMs = Date.now() - start;

      if (r.status < 200 || r.status >= 300 || !isRecord(r.data) || !isRecord((r.data as DiscoverParseResponse).filters)) {
        fail += 1;
        addOutcome(getAgg(byCategory, c.category), "fail");
        results.push({
          id: c.id,
          category: c.category,
          text: c.text,
          expected: c.expected,
          scoring: c.scoring,
          outcome: "fail",
          httpStatus: r.status,
          error: `Non-2xx or invalid response shape`,
          elapsedMs,
        });
        continue;
      }

      const payload = r.data as DiscoverParseResponse;
      const filters = payload.filters;
      const outcome = classifyCase(c, filters);

      if (outcome === "exact") exact += 1;
      else if (outcome === "partial") partial += 1;
      else if (outcome === "safe_degrade") safeDegrade += 1;
      else if (outcome === "fail") fail += 1;
      else safeDegrade += 1;

      const aggBucket: Exclude<Outcome, "unscored"> =
        outcome === "unscored" ? "safe_degrade" : outcome;
      addOutcome(getAgg(byCategory, c.category), aggBucket);

      results.push({
        id: c.id,
        category: c.category,
        text: c.text,
        expected: c.expected,
        scoring: c.scoring,
        outcome,
        httpStatus: r.status,
        source: payload.source,
        filters: cleanFilters(filters),
        summary: payload.summary,
        elapsedMs,
      });
    } catch (e) {
      const elapsedMs = Date.now() - start;
      fail += 1;
      addOutcome(getAgg(byCategory, c.category), "fail");
      results.push({
        id: c.id,
        category: c.category,
        text: c.text,
        expected: c.expected,
        scoring: c.scoring,
        outcome: "fail",
        error: e instanceof Error ? e.message : "request failed",
        elapsedMs,
      });
    }
  }

  const outDir = path.resolve(process.cwd(), "eval", "out");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `ai-discover-eval_${runLabel}_${nowStamp()}.json`);

  const table86Rows = order.map((cat) => {
    const a = byCategory.get(cat) ?? emptyAgg();
    return { category: cat, ...a };
  });

  let tot = emptyAgg();
  for (const row of table86Rows) {
    tot.utterancesTested += row.utterancesTested;
    tot.exact += row.exact;
    tot.partial += row.partial;
    tot.safe_degrade += row.safe_degrade;
    tot.fail += row.fail;
  }

  const summary = {
    title: gold.title ?? "AI discover-parse gold set",
    runLabel,
    endpoint,
    totalUtterances: gold.cases.length,
    counts: {
      exact,
      partial,
      safe_degrade: safeDegrade,
      fail,
    },
    table86: [...table86Rows, { category: "Total", ...tot }],
    notes: gold.notes ?? [],
  };

  fs.writeFileSync(outPath, JSON.stringify({ summary, results }, null, 2), "utf-8");

  console.log("=== Table 7.16 / 8.x overall counts ===");
  console.log(`Run label: ${runLabel}`);
  console.log(`Endpoint: ${endpoint}`);
  console.log(`Number of utterances (N): ${gold.cases.length}`);
  console.log(`Exact: ${exact}`);
  console.log(`Partial: ${partial}`);
  console.log(`Safe degrade: ${safeDegrade}`);
  console.log(`Fail: ${fail}`);
  console.log(`Results JSON: ${outPath}`);
  console.log("\n=== Table 8.6 — Natural language gold-set aggregate ===\n");
  console.log(
    "| Category | Utterances | Exact | Partial | Safe degrade | Fail |\n|---|---:|---:|---:|---:|---:|",
  );
  for (const row of [...table86Rows, { category: "Total", ...tot }]) {
    console.log(
      `| ${row.category} | ${row.utterancesTested} | ${row.exact} | ${row.partial} | ${row.safe_degrade} | ${row.fail} |`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

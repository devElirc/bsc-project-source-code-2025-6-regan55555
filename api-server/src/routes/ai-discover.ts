import { Router, type IRouter, type Request, type Response } from "express";
import * as z from "zod";
import { ListTrailsQueryParams } from "@workspace/api-zod";

const router: IRouter = Router();
const OPENAI_TIMEOUT_MS = 20_000;
const UI_FILTER_KEYS = new Set(["search", "difficulty", "terrain", "maxLength", "region"]);

const LlmFiltersSchema = z.object({
  search: z.string().nullable().optional(),
  difficulty: z.enum(["easy", "moderate", "hard", "expert"]).nullable().optional(),
  terrain: z.string().nullable().optional(),
  minLength: z.union([z.number(), z.string()]).nullable().optional(),
  maxLength: z.union([z.number(), z.string()]).nullable().optional(),
  minElevation: z.union([z.number(), z.string()]).nullable().optional(),
  maxElevation: z.union([z.number(), z.string()]).nullable().optional(),
  region: z.string().nullable().optional(),
  scenery: z.string().nullable().optional(),
  summary: z.string().optional(),
});

const SYSTEM = `You map UK hiking trail search phrases to a strict JSON object of filter fields.
Only use keys listed below. Use null for anything not clearly implied. Numbers are metric (km, metres).
difficulty must be one of: easy, moderate, hard, expert.
terrain/scenery/region: short English phrases matching how hikers describe UK trails (e.g. coastal, moorland, Lake District).
If the user names a place or trail, put it in "search" rather than guessing region.
For broad countries only (single word: Wales, Scotland, England, Northern Ireland), prefer putting that word in "search" and set "region" to null — rows use finer regions like Snowdonia or Cornwall.
When the user describes a specific UK area (e.g. "south coast of England", "South Downs", "south east England"), set "region" to the closest matching catalogue-style label so filters work — examples: "South England Coast", "South Downs", "South East England and Downs", "Hampshire and South Downs West". Use substring-style wording that matches trail region fields.
When they mention terrain type ("mixed terrain", "coastal", "moorland"), set "terrain" to a short substring that matches stored terrain text (e.g. "mixed", "coastal").
Respond with JSON only, no markdown.

Schema:
{
  "search": string | null,
  "difficulty": "easy"|"moderate"|"hard"|"expert"|null,
  "terrain": string | null,
  "minLength": number | null,
  "maxLength": number | null,
  "minElevation": number | null,
  "maxElevation": number | null,
  "region": string | null,
  "scenery": string | null,
  "summary": string
}

"summary" is one short sentence describing what you applied, for the UI (no trail names unless the user said them).`;

function num(v: unknown): number | undefined {
  if (v == null) return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const n = parseFloat(v.replace(/,/g, ""));
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

function stripNulls<T extends Record<string, unknown>>(o: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(o)) {
    if (v === null || v === undefined) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    out[k] = v;
  }
  return out;
}

function coerceFilters(raw: z.infer<typeof LlmFiltersSchema>): Record<string, unknown> {
  const base = stripNulls({
    search: raw.search ?? undefined,
    difficulty: raw.difficulty ?? undefined,
    terrain: raw.terrain ?? undefined,
    region: raw.region ?? undefined,
    scenery: raw.scenery ?? undefined,
    minLength: num(raw.minLength),
    maxLength: num(raw.maxLength),
    minElevation: num(raw.minElevation),
    maxElevation: num(raw.maxElevation),
  });
  return base;
}

/** DB regions use finer labels (e.g. Snowdonia); listing APIs AND-match region literally. */
const BROAD_REGION_TO_SEARCH = new Set(["Wales", "Scotland", "England", "Northern Ireland"]);

function normalizeBroadRegionToSearch(filters: Record<string, unknown>) {
  const region = filters.region;
  if (typeof region !== "string") return;
  if (!BROAD_REGION_TO_SEARCH.has(region)) return;
  const existing =
    typeof filters.search === "string" ? filters.search.trim() : "";
  filters.search = [existing, region].filter(Boolean).join(" ").trim();
  delete filters.region;
}

/** Map natural phrases to region / terrain substrings that match imported trail rows (ILIKE). */
function inferUiFiltersFromText(originalText: string, filters: Record<string, unknown>) {
  const lower = originalText.toLowerCase();

  // Phrase wins over vague LLM fields (e.g. region left empty or only search filled).
  if (/\bsouth\s+downs\b/.test(lower)) {
    filters.region = "South Downs";
  } else if (
    /\b(south\s+east|south-east)\b/.test(lower) &&
    /\b(england|downs|kent|sussex)\b/.test(lower)
  ) {
    filters.region = "South East England and Downs";
  } else if (/south\s+coast/.test(lower) && /\bengland\b/.test(lower)) {
    filters.region = "South England Coast";
  } else if (/\bhampshire\b/.test(lower)) {
    filters.region = "Hampshire and South Downs West";
  }

  if (/\bmixed\s+terrain\b/.test(lower)) {
    filters.terrain = "Mixed terrain";
  } else if (/\bmixed\b/.test(lower)) {
    filters.terrain = "mixed";
  } else if (/\bcoastal\b/.test(lower)) {
    filters.terrain = "coastal";
  }
}

function keepUiVisibleFilters(filters: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(filters).filter(([key]) => UI_FILTER_KEYS.has(key)),
  );
}

function parseNlRules(text: string): { filters: Record<string, unknown>; summary: string } {
  const lower = text.toLowerCase();
  const filters: Record<string, unknown> = {};
  const knobs: string[] = [];

  const diffs = ["easy", "moderate", "hard", "expert"] as const;
  for (const d of diffs) {
    if (new RegExp(`\\b${d}\\b`, "i").test(text)) {
      filters.difficulty = d;
      knobs.push(d);
      break;
    }
  }

  let m = lower.match(
    /(?:under|below|less than|at most|max(?:imum)?|shorter than)\s+(\d+(?:\.\d+)?)\s*k?m\b/,
  );
  if (m) {
    filters.maxLength = parseFloat(m[1]);
    knobs.push(`≤${m[1]} km`);
  }
  m = lower.match(/(?:over|more than|at least|longer than)\s+(\d+(?:\.\d+)?)\s*k?m\b/);
  if (m) {
    filters.minLength = parseFloat(m[1]);
    knobs.push(`≥${m[1]} km`);
  }
  m = lower.match(/\b(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)\s*k?m\b/);
  if (m) {
    filters.minLength = parseFloat(m[1]);
    filters.maxLength = parseFloat(m[2]);
    knobs.push(`${m[1]}–${m[2]} km`);
  }

  m = lower.match(
    /(?:less than|under|max(?:imum)?)\s+(\d+)\s*m\b(?:\s*(?:of|total)?\s*(?:elevation|gain|climb))?/,
  );
  if (m) {
    filters.maxElevation = parseInt(m[1], 10);
    knobs.push(`≤${m[1]} m gain`);
  }

  const terrainMap: [string, string][] = [
    ["coastal", "coastal"],
    ["moorland", "moorland"],
    ["woodland", "woodland"],
    ["forest", "woodland"],
    ["mountain", "mountain"],
    ["lake", "lake"],
  ];
  for (const [needle, val] of terrainMap) {
    if (lower.includes(needle)) {
      filters.terrain = val;
      knobs.push(val);
      break;
    }
  }

  const regions: [string, string][] = [
    ["lake district", "Lake District"],
    ["peak district", "Peak District"],
    ["snowdonia", "Snowdonia"],
    ["brecon beacons", "Brecon Beacons"],
    ["scottish highlands", "Scottish Highlands"],
    ["yorkshire dales", "Yorkshire Dales"],
    ["cotswolds", "Cotswolds"],
    ["cornwall", "Cornwall"],
    ["wales", "Wales"],
    ["scotland", "Scotland"],
  ];
  for (const [k, v] of regions) {
    if (lower.includes(k)) {
      filters.region = v;
      knobs.push(v);
      break;
    }
  }

  const sceneries = ["waterfall", "lakes", "valley", "historic", "castle"];
  for (const s of sceneries) {
    if (lower.includes(s)) {
      filters.scenery = s;
      knobs.push(s);
      break;
    }
  }

  const hasStructured = Object.keys(filters).length > 0;
  if (!hasStructured && text.trim().length > 0) {
    filters.search = text.trim().slice(0, 120);
    knobs.push(`search “${filters.search}”`);
  }

  const summary =
    knobs.length > 0
      ? `Rule-based parse: ${knobs.join(", ")}.`
      : text.trim()
        ? "No specific filters detected; using your text as a name/location search."
        : "Enter a short description (e.g. easy coastal walk under 10 km in Wales).";

  normalizeBroadRegionToSearch(filters);

  return { filters, summary };
}

async function parseWithOpenAi(text: string): Promise<{ filters: Record<string, unknown>; summary: string }> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) throw new Error("OPENAI_API_KEY missing");

  const model = process.env.OPENAI_MODEL ?? "gpt-4o-mini";
  const requestBody: Record<string, unknown> = {
    model,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: SYSTEM },
      { role: "user", content: text.slice(0, 2000) },
    ],
  };

  if (!/^gpt-5(?:-|$)/.test(model)) {
    requestBody.temperature = 0.2;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENAI_TIMEOUT_MS);
  let res: globalThis.Response;

  try {
    res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify(requestBody),
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new Error(`OpenAI request timed out after ${OPENAI_TIMEOUT_MS}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`OpenAI ${res.status}: ${errText.slice(0, 200)}`);
  }

  const body = (await res.json()) as {
    choices?: Array<{ message?: { content?: string } }>;
  };
  const content = body.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty OpenAI response");

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Invalid JSON from model");
  }

  const llm = LlmFiltersSchema.safeParse(parsed);
  if (!llm.success) {
    throw new Error("Model output failed validation");
  }

  const filters = coerceFilters(llm.data);
  normalizeBroadRegionToSearch(filters);
  const validated = ListTrailsQueryParams.partial().safeParse(filters);
  if (!validated.success) {
    throw new Error("Filters failed API schema");
  }

  const summary =
    typeof llm.data.summary === "string" && llm.data.summary.trim()
      ? llm.data.summary.trim()
      : "Applied filters from your description.";

  return { filters: validated.data as Record<string, unknown>, summary };
}

router.post("/ai/discover-parse", async (req: Request, res: Response) => {
  try {
    const body = z.object({ text: z.string().max(2000) }).safeParse(req.body);
    if (!body.success) {
      res.status(400).json({ title: "Bad Request", detail: "Expected { text: string }" });
      return;
    }

    const text = body.data.text.trim();
    if (!text) {
      res.status(400).json({ title: "Bad Request", detail: "text is empty" });
      return;
    }

    const hasKey =
      typeof process.env.OPENAI_API_KEY === "string" && process.env.OPENAI_API_KEY.trim().length > 0;
    if (process.env.NODE_ENV === "development") {
      console.log(`[ai-discover] has OPENAI_API_KEY: ${hasKey ? "yes" : "no"}`);
    }

    let source: "openai" | "rules" = "rules";
    let filters: Record<string, unknown>;
    let summary: string;

    try {
      if (hasKey) {
        const out = await parseWithOpenAi(text);
        filters = { ...(out.filters as Record<string, unknown>) };
        summary = out.summary;
        source = "openai";
      } else {
        const out = parseNlRules(text);
        filters = { ...out.filters };
        summary = out.summary;
      }
    } catch (e) {
      const out = parseNlRules(text);
      filters = { ...out.filters };
      const note = e instanceof Error ? e.message : "parse error";
      summary = `${out.summary} (LLM unavailable — used rules. ${note})`;
      source = "rules";
    }

    normalizeBroadRegionToSearch(filters);
    inferUiFiltersFromText(text, filters);
    normalizeBroadRegionToSearch(filters);
    filters = keepUiVisibleFilters(filters);

    const merged = ListTrailsQueryParams.partial().safeParse({ ...filters });
    if (!merged.success) {
      res.status(500).json({ title: "Server Error", detail: "Could not build filters" });
      return;
    }

    res.json({
      filters: merged.data,
      summary,
      source,
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ title: "Server Error", detail: "discover-parse failed" });
  }
});

export default router;

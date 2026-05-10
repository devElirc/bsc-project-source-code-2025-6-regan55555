import path from "node:path";
import process from "node:process";
import axios from "axios";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

type Example = {
  id: string;
  utterance: string;
  goldExpectation: string;
  comment: string;
};

type DiscoverParseResponse = {
  filters: Record<string, unknown>;
  summary?: string;
  source?: "openai" | "rules";
};

function compactJson(v: unknown): string {
  const s = JSON.stringify(v);
  // keep table readable
  return s.length > 120 ? s.slice(0, 117) + "…" : s;
}

async function runOne(base: string, utterance: string) {
  const r = await axios.post<DiscoverParseResponse>(
    `${base}/api/ai/discover-parse`,
    { text: utterance },
    { validateStatus: () => true, timeout: 120000 },
  );

  if (r.status < 200 || r.status >= 300) {
    return {
      ok: false as const,
      status: r.status,
      data: r.data,
    };
  }

  return { ok: true as const, status: r.status, data: r.data };
}

async function main() {
  const base = (process.env.API_BASE_URL || "http://localhost:5000").replace(/\/+$/, "");

  const examples: Example[] = [
    {
      id: "1",
      utterance: "easy walk under 10 km in Wales",
      goldExpectation: "difficulty=easy; maxLength=10; region/search=Wales",
      comment: "Checks difficulty + distance + broad region handling (often mapped into search).",
    },
    {
      id: "2",
      utterance: "hard mountain hike with good views",
      goldExpectation: "difficulty=hard; terrain=mountain; scenery~views (if supported)",
      comment: "Checks terrain inference; scenery may degrade safely if unsupported by parser.",
    },
    {
      id: "3",
      utterance: "short forest route for beginners",
      goldExpectation: "difficulty=easy (beginners); terrain~forest/woodland; short length preference (if supported)",
      comment: "Checks vague wording; acceptable to fall back to terrain/search rather than inventing precise bounds.",
    },
    {
      id: "4",
      utterance: "coastal trail near Cornwall",
      goldExpectation: "terrain=coastal; region/search=Cornwall",
      comment: "Checks place-name extraction + coastal term mapping.",
    },
  ];

  console.log("=== Table 8.7 — Natural language worked examples (real outputs) ===\n");
  console.log("| Example | Utterance | Gold expectation | Observed output | Source | Comment |");
  console.log("|---:|---|---|---|---|---|");

  for (const ex of examples) {
    const out = await runOne(base, ex.utterance);
    if (!out.ok) {
      console.log(
        `| ${ex.id} | ${ex.utterance} | ${ex.goldExpectation} | HTTP ${out.status} ${compactJson(out.data)} | — | ${ex.comment} |`,
      );
      continue;
    }
    const filters = out.data.filters ?? {};
    const source = out.data.source ?? "rules";
    console.log(
      `| ${ex.id} | ${ex.utterance} | ${ex.goldExpectation} | ${compactJson(filters)} | ${source} | ${ex.comment} |`,
    );
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});


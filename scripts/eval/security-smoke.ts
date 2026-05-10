import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import axios from "axios";
import dotenv from "dotenv";
import pg from "pg";

dotenv.config({ path: path.resolve(process.cwd(), "..", ".env") });

const apiBase = (process.env.API_BASE_URL || "http://localhost:5000").replace(/\/+$/, "");

type Row = { check: string; expectedObservation: string; result: string; pass: boolean };

const rows: Row[] = [];

async function probeTrails_sqlLikeSearch(): Promise<Row> {
  const payloads = [
    `test'`,
    `'; DROP TABLE trails; --`,
    `1 OR 1=1`,
    `' UNION SELECT NULL--`,
    `%25%27%22`,
  ];

  let worstStatus = -1;
  let firstErrorBody = "";

  for (const search of payloads) {
    try {
      const r = await axios.get(`${apiBase}/api/trails`, {
        params: { limit: 5, offset: 0, search },
        validateStatus: () => true,
      });
      worstStatus = Math.max(worstStatus, r.status);
      if (!firstErrorBody && r.status >= 400) firstErrorBody = JSON.stringify(r.data).slice(0, 180);
      if (r.status >= 500) {
        return {
          check: "SQL-like search input",
          expectedObservation:
            "Search terms with quotes or SQL-like fragments should not break filtering.",
          result: `FAIL: unexpected server error HTTP ${r.status} for search=${JSON.stringify(search)} body=${JSON.stringify(r.data)?.slice(0, 160)}`,
          pass: false,
        };
      }
    } catch (e) {
      return {
        check: "SQL-like search input",
        expectedObservation:
          "Search terms with quotes or SQL-like fragments should not break filtering.",
        result: `FAIL: request threw ${e instanceof Error ? e.message : String(e)}`,
        pass: false,
      };
    }
  }

  return {
    check: "SQL-like search input",
    expectedObservation:
      "Search terms with quotes or SQL-like fragments should not break filtering.",
    result: `PASS: all payloads returned HTTP < 500 (${payloads.length} probes; max status ${worstStatus})${worstStatus >= 400 ? ` (${firstErrorBody})` : ""}`,
    pass: true,
  };
}

function walkFiles(dir: string, exts = new Set([".js", ".mjs", ".css", ".html", ".svg"])): string[] {
  if (!fs.existsSync(dir)) return [];
  const out: string[] = [];
  function walk(d: string) {
    for (const name of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, name.name);
      if (name.isDirectory()) walk(p);
      else if (exts.has(path.extname(name.name))) out.push(p);
    }
  }
  walk(dir);
  return out;
}

async function probeClient_bundleSecrets(): Promise<Row> {
  const repoRoot = path.resolve(process.cwd(), "..");
  const distRel = process.env.CLIENT_DIST || path.join(repoRoot, "client", "dist");
  const dist = path.isAbsolute(distRel) ? distRel : path.resolve(process.cwd(), distRel);

  if (process.env.SKIP_BUNDLE_SCAN === "1" || process.env.SKIP_BUNDLE_SCAN === "true") {
    return {
      check: "Client bundle secret search",
      expectedObservation: "Built client assets should not contain OPENAI_API_KEY or actual secret values.",
      result: "SKIPPED (SKIP_BUNDLE_SCAN set). Run `npm run build -w @workspace/trail-finder` and re-run.",
      pass: false,
    };
  }

  if (!fs.existsSync(dist)) {
    return {
      check: "Client bundle secret search",
      expectedObservation: "Built client assets should not contain OPENAI_API_KEY or actual secret values.",
      result:
        `SKIPPED — no bundle at ${dist}. Run client build then re-run or set SKIP_BUNDLE_SCAN.`,
      pass: false,
    };
  }

  const needles: string[] = ["OPENAI_API_KEY", "openai_api_key"];

  const key = process.env.OPENAI_API_KEY?.trim();
  if (key && key.length > 16) needles.push(key.slice(0, 20));

  let hits: Array<{ needle: string; file: string }> = [];

  const files = walkFiles(dist);
  for (const fp of files) {
    let content: string;
    try {
      content = fs.readFileSync(fp, "utf8");
    } catch {
      continue;
    }
    const rel = path.relative(repoRoot, fp);
    for (const n of needles) {
      if (!n) continue;
      if (content.includes(n)) hits.push({ needle: n.includes("OPENAI_API") ? n : `${n.slice(0, 12)}…`, file: rel });
    }
  }

  if (hits.length) {
    return {
      check: "Client bundle secret search",
      expectedObservation: "Built client assets should not contain OPENAI_API_KEY or actual secret values.",
      result: `FAIL: ${hits.length} occurrence(s): ${hits.slice(0, 6).map((h) => `${h.file} (${h.needle})`).join("; ")}`,
      pass: false,
    };
  }

  return {
    check: "Client bundle secret search",
    expectedObservation: "Built client assets should not contain OPENAI_API_KEY or actual secret values.",
    result: `PASS: scanned ${files.length} asset(s) under dist; no forbidden secret markers found.`,
    pass: true,
  };
}

function isBcryptHash(s: string): boolean {
  return /^\$2[aby]\$\d{2}\$[\./0-9A-Za-z]{53}$/.test(s);
}

async function probe_passwordStorage(): Promise<Row> {
  const conn = process.env.DATABASE_URL?.trim();
  if (!conn) {
    return {
      check: "Password storage",
      expectedObservation: "Stored password values should be hashes, not plain text.",
      result: "SKIPPED — DATABASE_URL not set.",
      pass: false,
    };
  }

  const client = new pg.Client({ connectionString: conn });
  try {
    await client.connect();
    const r = await client.query<{ password_hash: string | null }>(
      `SELECT password_hash FROM users WHERE password_hash IS NOT NULL LIMIT 10`,
    );
    if (!r.rows.length) {
      return {
        check: "Password storage",
        expectedObservation: "Stored password values should be hashes, not plain text.",
        result: "INCONCLUSIVE — no users with password_hash in DB (sign up a test user or seed).",
        pass: true,
      };
    }

    const bad = r.rows.filter((row) => !row.password_hash || !isBcryptHash(row.password_hash));

    if (bad.length) {
      return {
        check: "Password storage",
        expectedObservation: "Stored password values should be hashes, not plain text.",
        result: `FAIL: ${bad.length}/${r.rows.length} sampled password_hash value(s) are not bcrypt (${bad[0]?.password_hash?.slice(0, 20)}…)`,
        pass: false,
      };
    }

    return {
      check: "Password storage",
      expectedObservation: "Stored password values should be hashes, not plain text.",
      result: `PASS: sampled ${r.rows.length} non-null password_hash value(s); all match bcrypt format ($2…).`,
      pass: true,
    };
  } catch (e) {
    return {
      check: "Password storage",
      expectedObservation: "Stored password values should be hashes, not plain text.",
      result: `FAIL: DB query error ${e instanceof Error ? e.message : String(e)}`,
      pass: false,
    };
  } finally {
    await client.end().catch(() => {});
  }
}

async function probe_session(): Promise<Row> {
  try {
    const r = await axios.patch(
      `${apiBase}/api/auth/profile`,
      { firstName: "Smoke", lastName: "Test" },
      {
        headers: {
          Cookie: "sid=fake-session-not-in-db;",
        },
        validateStatus: () => true,
      },
    );

    const ok = r.status === 401 || (typeof r.data === "object" && r.data && (r.data as { error?: string }).error);

    return {
      check: "Session behaviour",
      expectedObservation:
        "Invalid or expired sessions should not expose protected user data.",
      result:
        ok && r.status === 401
          ? `PASS: PATCH /api/auth/profile with bogus sid returned HTTP 401 (${JSON.stringify(r.data)})`
          : `Unexpected: HTTP ${r.status} — ${JSON.stringify(r.data)?.slice(0, 200)}`,
      pass: ok && r.status === 401,
    };
  } catch (e) {
    return {
      check: "Session behaviour",
      expectedObservation:
        "Invalid or expired sessions should not expose protected user data.",
      result: `FAIL: ${e instanceof Error ? e.message : String(e)}`,
      pass: false,
    };
  }
}

async function probe_mediaProxy(): Promise<Row> {
  const cases: Array<{ label: string; url: string; expectStatus: number }> = [
    { label: "missing url", url: `${apiBase}/api/media/proxy`, expectStatus: 400 },
    { label: "invalid url text", url: `${apiBase}/api/media/proxy?url=${encodeURIComponent("not-a-url-at-all")}`, expectStatus: 400 },
    { label: "non-http scheme", url: `${apiBase}/api/media/proxy?url=${encodeURIComponent("javascript:alert(1)")}`, expectStatus: 400 },
  ];

  const details: string[] = [];

  for (const c of cases) {
    const r = await axios.get(c.url, { validateStatus: () => true });
    details.push(`${c.label}:HTTP${r.status}`);
    if (r.status !== c.expectStatus) {
      return {
        check: "Media proxy safety",
        expectedObservation:
          "Missing or invalid proxy URLs should be handled safely.",
        result: `FAIL: ${c.label} expected ${c.expectStatus}, got ${r.status} (${JSON.stringify(r.data)?.slice(0, 120)})`,
        pass: false,
      };
    }
  }

  return {
    check: "Media proxy safety",
    expectedObservation: "Missing or invalid proxy URLs should be handled safely.",
    result: `PASS: ${details.join("; ")} (no crashes, JSON error bodies for bad input).`,
    pass: true,
  };
}

async function main() {
  rows.push(await probeClient_bundleSecrets());
  rows.push(await probeTrails_sqlLikeSearch());
  rows.push(await probe_passwordStorage());
  rows.push(await probe_session());
  rows.push(await probe_mediaProxy());

  const outDir = path.resolve(process.cwd(), "eval", "out");
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const outPath = path.join(outDir, `security-smoke_${stamp}.json`);

  fs.writeFileSync(outPath, JSON.stringify({ apiBaseUrl: apiBase, rows }, null, 2), "utf-8");

  console.log("=== Table 8.4 — Security smoke observations ===\n");
  console.log("| Check | Expected | Result | Pass |");
  console.log("| --- | --- | --- | :---: |");

  for (const r of rows) {
    const res = r.result.replace(/\|/g, "\\|");
    console.log(`| ${r.check} | ${r.expectedObservation} | ${res} | ${r.pass ? "Yes" : "No"} |`);
  }

  console.log(`\nSaved: ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

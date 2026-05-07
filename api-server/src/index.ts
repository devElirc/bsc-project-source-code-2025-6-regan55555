import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import app from "./app";

function loadEnvFile(envPath: string) {
  if (!fs.existsSync(envPath)) return;

  const contents = fs.readFileSync(envPath, "utf8");

  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const [key, ...rest] = trimmed.split("=");
    const value = rest.join("=").trim();

    // Allow .env to fill missing/empty vars without clobbering real env.
    if (!key) continue;
    const existing = process.env[key];
    if (typeof existing === "string" && existing.trim().length > 0) continue;
    process.env[key] = value;
  }
}

function loadRootEnv() {
  const thisDir = path.dirname(url.fileURLToPath(import.meta.url));
  // repoRoot/api-server/src -> repoRoot/api-server -> repoRoot
  const apiServerDir = path.resolve(thisDir, "..");
  const repoRootDir = path.resolve(apiServerDir, "..");

  // Prefer repo root .env (shared with workspaces), then api-server/.env.
  loadEnvFile(path.join(repoRootDir, ".env"));
  loadEnvFile(path.join(apiServerDir, ".env"));
}

loadRootEnv();

const rawPort = process.env["API_PORT"] ?? "5000";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid API_PORT value: "${rawPort}"`);
}

if (process.env.NODE_ENV === "development") {
  const hasOpenAi = typeof process.env.OPENAI_API_KEY === "string" && process.env.OPENAI_API_KEY.trim().length > 0;
  console.log(`[env] OPENAI_API_KEY loaded: ${hasOpenAi ? "yes" : "no"}`);
}

const server = app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});

server.on("close", () => {
  console.log("[server] http server closed");
});

// In some Windows/tsx setups the process can exit even after listen().
// A tiny interval ensures the dev server stays alive.
if (process.env.NODE_ENV === "development") {
  setInterval(() => {}, 60_000);
}

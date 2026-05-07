#!/usr/bin/env node
/**
 * Loads .env from workspace root and runs drizzle-kit push.
 * Run from lib/db: node scripts/run-push.mjs
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Script is at lib/db/scripts/run-push.mjs → workspace root is ../../..
const rootDir = path.resolve(__dirname, "../../..");
const envPath = path.join(rootDir, ".env");

try {
  const content = fs.readFileSync(envPath, "utf8");
  for (const line of content.split("\n")) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match) {
      const key = match[1];
      const value = match[2].replace(/^["']|["']$/g, "").trim();
      if (!(key in process.env)) process.env[key] = value;
    }
  }
} catch (err) {
  if (err.code !== "ENOENT") throw err;
  console.warn("No .env at", envPath, "- using existing env");
}

const args = process.argv.slice(2).join(" ");
execSync(`npx drizzle-kit push --config ./drizzle.config.cjs ${args}`, {
  stdio: "inherit",
  cwd: path.resolve(__dirname, ".."),
  env: process.env,
});

import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

function loadRootEnv() {
  const rootDir = path.resolve(__dirname, "..");
  const envPath = path.join(rootDir, ".env");

  if (!fs.existsSync(envPath)) return;

  const contents = fs.readFileSync(envPath, "utf8");

  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const [key, ...rest] = trimmed.split("=");
    const value = rest.join("=").trim();

    if (!key || key in process.env) continue;
    process.env[key] = value;
  }
}

loadRootEnv();

const port = Number(process.env.PORT ?? 5173);
const basePath = process.env.BASE_PATH ?? "/";

export default defineConfig({
  base: basePath,

  plugins: [
    react(),
    tailwindcss()
  ],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@assets": path.resolve(__dirname, "../../attached_assets")
    },
    dedupe: ["react", "react-dom"]
  },

  root: path.resolve(__dirname),

  build: {
    outDir: path.resolve(__dirname, "dist"),
    emptyOutDir: true
  },

  server: {
    port,
    host: true,
    hmr: true,

    proxy: {
      "/api": {
        target: "http://localhost:5000",
        changeOrigin: true
      }
    }
  },

  preview: {
    port,
    host: true
  }
});
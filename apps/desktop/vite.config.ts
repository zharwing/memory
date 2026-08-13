import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { selectiveMermaidDiagrams } from "./build/selective-mermaid.js";

const appRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: appRoot,
  envDir: fileURLToPath(new URL("../..", import.meta.url)),
  // Vite's default VITE_ prefix is intentionally disabled. Only explicitly
  // public, non-authority runtime hints can be compiled into browser bytes.
  envPrefix: ["ZHARWING_PUBLIC_"],
  plugins: [
    selectiveMermaidDiagrams(),
    react()
  ],
  resolve: {
    alias: {
      "@zharwing/memory-api-client": fileURLToPath(new URL("../../packages/api-client/src/index.ts", import.meta.url)),
      "@zharwing/memory-core": fileURLToPath(new URL("../../packages/core/src/index.ts", import.meta.url)),
      "@zharwing/memory-graph": fileURLToPath(new URL("../../packages/graph/src/index.ts", import.meta.url)),
      // The /proposals alias must come before the package alias so the
      // browser-safe subpath does not resolve through the node-only barrel.
      "@zharwing/memory-semantic-graph/proposals": fileURLToPath(new URL("../../packages/semantic-graph/src/proposals.ts", import.meta.url)),
      "@zharwing/memory-semantic-graph": fileURLToPath(new URL("../../packages/semantic-graph/src/index.ts", import.meta.url)),
      "@zharwing/memory-theme": fileURLToPath(new URL("../../packages/theme/src/index.ts", import.meta.url))
    }
  },
  server: {
    host: "127.0.0.1",
    port: 5174,
    strictPort: true
  },
  build: {
    // The editor and graph engines are intentionally lazy-loaded feature chunks.
    // scripts/check-bundle-size.mjs enforces both startup and maximum chunk budgets.
    chunkSizeWarningLimit: 1200,
    manifest: true,
    sourcemap: false,
    cssCodeSplit: true,
    assetsInlineLimit: 4096,
    target: ["es2022", "chrome110", "edge110", "firefox115", "safari16.4"]
  }
});

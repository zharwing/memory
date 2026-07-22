import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const appRoot = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
  root: appRoot,
  envDir: fileURLToPath(new URL("../..", import.meta.url)),
  plugins: [react()],
  resolve: {
    alias: {
      "@zharwing/memory-api-client": fileURLToPath(new URL("../../packages/api-client/src/index.ts", import.meta.url)),
      "@zharwing/memory-theme": fileURLToPath(new URL("../../packages/theme/src/index.ts", import.meta.url))
    }
  },
  server: {
    port: 5174,
    strictPort: true
  },
  build: {
    // The editor and graph engines are intentionally lazy-loaded feature chunks.
    // scripts/check-bundle-size.mjs enforces both startup and maximum chunk budgets.
    chunkSizeWarningLimit: 1200
  }
});

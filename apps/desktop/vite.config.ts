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
      "@aimem/api-client": fileURLToPath(new URL("../../packages/api-client/src/index.ts", import.meta.url)),
      "@aimem/theme": fileURLToPath(new URL("../../packages/theme/src/index.ts", import.meta.url))
    }
  },
  server: {
    port: 5174,
    strictPort: true
  }
});

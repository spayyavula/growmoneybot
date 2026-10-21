// Builds the clickable preview (mock API, hash routing) into dist-preview/
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [react()],
  // Always build against this checkout's core, even from a git worktree
  resolve: { alias: { "@gmb/core": fileURLToPath(new URL("../../packages/core/src/index.js", import.meta.url)) } },
  base: "./",
  build: { outDir: "dist-preview", chunkSizeWarningLimit: 800, rollupOptions: { input: "preview.html" } },
  server: { fs: { allow: ["../.."] } },
});

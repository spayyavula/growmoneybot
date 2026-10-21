// Builds the clickable preview (mock API, hash routing) into dist-preview/
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "./",
  build: { outDir: "dist-preview", chunkSizeWarningLimit: 800, rollupOptions: { input: "preview.html" } },
  server: { fs: { allow: ["../.."] } },
});

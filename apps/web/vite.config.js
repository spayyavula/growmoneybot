import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // PineTS is large but only loads when Pine Lab runs a script
  build: { chunkSizeWarningLimit: 800 },
  server: {
    // When running the client alone (npm run dev:client + npm run dev:server)
    proxy: { "/api": "http://localhost:5000" },
  },
});

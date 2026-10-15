import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the production build loads from the app:// protocol (no web server, no network).
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: { port: 5173, strictPort: true, host: "127.0.0.1" },
  build: { outDir: "dist", chunkSizeWarningLimit: 2000 },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
} as never);

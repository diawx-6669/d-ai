import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// In development Vite proxies /api to the Go backend, so the frontend code can
// always use same-origin relative URLs -- the same thing nginx does in
// production. VITE_API_BASE therefore stays empty in both.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3000,
    proxy: {
      "/api": {
        target: process.env.VITE_DEV_API_TARGET || "http://127.0.0.1:8080",
        changeOrigin: true,
        // SSE from /api/chat must not be buffered by the dev proxy.
        ws: false,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: false,
  },
});

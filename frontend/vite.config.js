import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxy /api requests to the FastAPI backend so the frontend can use
// relative URLs and avoid CORS issues entirely during development.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
      },
    },
  },
});

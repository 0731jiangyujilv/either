import react from "@vitejs/plugin-react";
import path from "node:path";
import {defineConfig} from "vite";

export default defineConfig({
  plugins: [react()],

  // The .env carried over from the Next build still uses NEXT_PUBLIC_ names, so
  // they stay readable through import.meta.env rather than being renamed.
  envPrefix: ["VITE_", "NEXT_PUBLIC_"],

  resolve: {
    alias: {"@": path.resolve(__dirname, "./src")},
  },

  build: {
    outDir: "dist",
    sourcemap: true,
  },

  server: {
    port: 3000,
  },
});

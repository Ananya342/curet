import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [react()],
  // LIFEPET_GEMINI_KEY in .env.local becomes the default Gemini key (see .env.example), but only in
  // `tauri dev`: a build is meant to be shared, and anything baked into its JavaScript can be read
  // straight out of the app. LIFEPET_SHARE_MY_KEYS=1 bakes it into a build anyway.
  envPrefix:
    command === "build" && process.env.LIFEPET_SHARE_MY_KEYS !== "1"
      ? ["VITE_"]
      : ["VITE_", "LIFEPET_GEMINI_"],

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));

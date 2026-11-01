import fs from "node:fs";
import path from "node:path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig(({ mode }) => {
  const fileEnv = loadEnv(mode, process.cwd(), "VITE_");
  const base = process.env.VITE_BASE_PATH || fileEnv.VITE_BASE_PATH || "/";

  return {
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.png", "robots.txt", "templates/students-template.csv"],
      manifest: {
        name: "נשארים",
        short_name: "נשארים",
        description: "ניהול השארות אחרי שעות הלימודים",
        lang: "he",
        dir: "rtl",
        display: "standalone",
        background_color: "#007285",
        theme_color: "#007285",
        start_url: ".",
        scope: ".",
        icons: [
          { src: "icons/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icons/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        navigateFallback: "index.html",
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2,csv}"],
      },
    }),
    {
      name: "github-pages-spa-fallback",
      apply: "build",
      closeBundle() {
        const dist = path.resolve("dist");
        const index = path.join(dist, "index.html");
        if (fs.existsSync(index)) fs.copyFileSync(index, path.join(dist, "404.html"));
      },
    },
  ],
  };
});

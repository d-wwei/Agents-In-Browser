import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "path";
import { copyFileSync, mkdirSync, existsSync } from "fs";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "copy-manifest",
      writeBundle() {
        const distDir = resolve(__dirname, "dist");
        copyFileSync(
          resolve(__dirname, "manifest.json"),
          resolve(distDir, "manifest.json"),
        );
        const iconsDir = resolve(distDir, "icons");
        if (!existsSync(iconsDir)) mkdirSync(iconsDir, { recursive: true });
        const srcIcons = resolve(__dirname, "public/icons");
        if (existsSync(srcIcons)) {
          for (const f of ["icon16.png", "icon48.png", "icon128.png"]) {
            const src = resolve(srcIcons, f);
            if (existsSync(src)) copyFileSync(src, resolve(iconsDir, f));
          }
        }
      },
    },
  ],
  build: {
    outDir: "dist",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        sidepanel: resolve(__dirname, "sidepanel.html"),
        background: resolve(__dirname, "src/background/index.ts"),
        content: resolve(__dirname, "src/content/index.ts"),
      },
      output: {
        // Chrome MV3 service workers and content scripts must be self-contained
        manualChunks: undefined,
        inlineDynamicImports: false,
        entryFileNames: (chunk) => {
          if (chunk.name === "background") return "background.js";
          if (chunk.name === "content") return "content.js";
          return "assets/[name]-[hash].js";
        },
        chunkFileNames: "assets/[name]-[hash].js",
        assetFileNames: "assets/[name]-[hash].[ext]",
      },
    },
  },
  resolve: {
    alias: {
      "@shared": resolve(__dirname, "../shared/src"),
    },
  },
});

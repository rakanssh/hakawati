import path from "path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";
import { transform } from "@swc/core";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import { lingui } from "@lingui/vite-plugin";

const host = process.env.TAURI_DEV_HOST;

function safari14Compatibility(): Plugin {
  return {
    name: "safari14-destructuring",
    apply: "build",
    enforce: "post",
    renderChunk(code, chunk, options) {
      if (options.format !== "es") return null;
      // esbuild 0.28 rejects destructuring for Safari 14. Lower it before
      // the TLA plugin runs its final esbuild pass, retaining the existing target.
      // Remove when esbuild/TLA can lower this syntax for Safari 14 themselves.
      return transform(code, {
        filename: chunk.fileName,
        swcrc: false,
        configFile: false,
        sourceMaps: true,
        jsc: { parser: { syntax: "ecmascript" } },
        env: {
          targets: { safari: "14" },
          include: [
            "transform-destructuring",
            "transform-parameters",
            "transform-object-rest-spread",
          ],
        },
      });
    },
  };
}

// https://vitejs.dev/config/
export default defineConfig(async () => ({
  plugins: [
    react({
      babel: {
        plugins: ["@lingui/babel-plugin-lingui-macro"],
      },
    }),
    lingui(),
    tailwindcss(),
    wasm(),
    safari14Compatibility(),
    topLevelAwait(),
  ],

  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "./app"),
    },
  },

  base: "./",
  build: {
    outDir: "dist",
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent vite from obscuring rust errors
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
      // 3. tell vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));

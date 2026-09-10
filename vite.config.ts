import path from "path";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";
import { transform } from "@swc/core";
import react from "@vitejs/plugin-react";
import wasm from "vite-plugin-wasm";
import topLevelAwait from "vite-plugin-top-level-await";
import { lingui } from "@lingui/vite-plugin";

const host = process.env.TAURI_DEV_HOST;

const safari14Compatibility: Plugin = {
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

export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: ["@lingui/babel-plugin-lingui-macro"],
      },
    }),
    lingui(),
    tailwindcss(),
    wasm(),
    safari14Compatibility,
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

  // Keep Rust errors visible during Tauri development.
  clearScreen: false,
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
      ignored: ["**/src-tauri/**"],
    },
  },
});

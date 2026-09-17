import path from "node:path";
import { defineConfig, mergeConfig } from "vite";
import baseConfig from "./vite.config";

// Only this explicit, serve-only config substitutes desktop capabilities.
export default defineConfig(({ command }) => {
  if (command !== "serve" || process.env.TAURI_ENV_PLATFORM) {
    throw new Error(
      "Browser preview is only available through npm run dev:browser",
    );
  }
  const previewFile = (name: string) =>
    path.resolve(process.cwd(), "app/browser-preview", name);
  return mergeConfig(baseConfig, {
    cacheDir: "node_modules/.vite-browser-preview",
    plugins: [
      {
        name: "browser-preview-entry",
        transformIndexHtml: {
          order: "pre",
          handler: (html: string) =>
            html.replace("/app/entry.tsx", "/app/browser-preview/entry.ts"),
        },
      },
    ],
    resolve: {
      alias: [
        {
          find: /^@tauri-apps\/plugin-sql$/,
          replacement: previewFile("sql.ts"),
        },
        ...[
          "api/core",
          "api/path",
          "api/app",
          "plugin-http",
          "plugin-clipboard-manager",
          "plugin-opener",
        ].map((module) => ({
          find: new RegExp(`^@tauri-apps/${module}$`),
          replacement: previewFile("native.ts"),
        })),
      ],
    },
    server: {
      host: "127.0.0.1",
      port: 1422,
      strictPort: true,
      hmr: { host: "127.0.0.1", port: 1422 },
    },
  });
});

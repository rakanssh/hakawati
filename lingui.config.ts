import { defineConfig } from "@lingui/cli";

export default defineConfig({
  sourceLocale: "en",
  locales: ["en", "ar"],
  catalogs: [
    {
      path: "<rootDir>/app/locales/{locale}/messages",
      include: ["app"],
    },
  ],
});

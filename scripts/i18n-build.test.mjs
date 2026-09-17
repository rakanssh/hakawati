// @vitest-environment node
import { execFile } from "node:child_process";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { promisify } from "node:util";
import { getConfig } from "@lingui/conf";
import { createCompiledCatalog, getCatalogs } from "@lingui/cli/api";
import { setupI18n } from "@lingui/core";
import { generateMessageId } from "@lingui/message-utils/generateMessageId";
import { expect, it } from "vitest";

const executeFile = promisify(execFile);
const require = createRequire(import.meta.url);

it("builds readable source fallbacks for unextracted messages without replacing translations", async () => {
  const tempRoot = path.resolve(os.tmpdir());
  const directory = await mkdtemp(path.join(tempRoot, "hakawati-i18n-"));
  if (path.dirname(path.resolve(directory)) !== tempRoot) {
    throw new Error("Unexpected temporary fixture path");
  }
  try {
    const configPath = path.join(directory, "lingui.config.cjs");
    await writeFile(
      configPath,
      `module.exports = {
        sourceLocale: "en",
        locales: ["en", "ar"],
        catalogs: [{
          path: "<rootDir>/locales/{locale}/messages",
          include: ["<rootDir>/source.js"],
        }],
      };`,
    );
    await writeFile(
      path.join(directory, "source.js"),
      `import { msg } from "@lingui/core/macro";
       const name = "Rakan";
       export const labels = [
         msg\`Public Scenarios\`, msg\`Discover\`,
         msg\`No public scenarios yet.\`, msg\`Hello \${name}\`,
         msg\`Settings\`,
       ];`,
    );
    for (const [locale, translation] of [
      ["en", "Settings"],
      ["ar", "الإعدادات"],
    ]) {
      const localeDirectory = path.join(directory, "locales", locale);
      await mkdir(localeDirectory, { recursive: true });
      await writeFile(
        path.join(localeDirectory, "messages.po"),
        `msgid ""\nmsgstr ""\n"Language: ${locale}\\n"\n"Content-Type: text/plain; charset=UTF-8\\n"\n\nmsgid "Settings"\nmsgstr "${translation}"\n`,
      );
    }

    const config = getConfig({ cwd: directory, configPath });
    const [catalog] = await getCatalogs(config);
    const fallbacks = [
      "Public Scenarios",
      "Discover",
      "No public scenarios yet.",
      "Hello {name}",
    ];
    const originalCatalogs = await Promise.all(
      config.locales.map((locale) =>
        readFile(catalog.getFilename(locale), "utf8"),
      ),
    );
    for (const locale of config.locales) {
      const entries = await catalog.read(locale);
      for (const message of fallbacks) {
        expect(entries).not.toHaveProperty(generateMessageId(message));
      }
    }

    await executeFile(
      process.execPath,
      [
        path.join(path.dirname(require.resolve("@lingui/cli")), "lingui.js"),
        "extract-template",
        "--config",
        configPath,
        "--workers",
        "1",
      ],
      { cwd: directory },
    );

    for (const [index, locale] of config.locales.entries()) {
      // The build template must not rewrite the maintained translation files.
      expect(await readFile(catalog.getFilename(locale), "utf8")).toBe(
        originalCatalogs[index],
      );
      const { messages } = await catalog.getTranslations(locale, {
        sourceLocale: config.sourceLocale,
        fallbackLocales: config.fallbackLocales,
      });
      const compiled = createCompiledCatalog(locale, messages, {
        namespace: "json",
      });
      expect(compiled.errors).toEqual([]);
      const i18n = setupI18n({
        locale,
        messages: { [locale]: JSON.parse(compiled.source).messages },
      });

      // Production macros supply only IDs: no message/default is passed here.
      for (const message of fallbacks.slice(0, 3)) {
        expect(i18n._(generateMessageId(message))).toBe(message);
      }
      expect(i18n._(generateMessageId("Hello {name}"), { name: "Rakan" })).toBe(
        "Hello Rakan",
      );
      expect(i18n._(generateMessageId("Settings"))).toBe(
        locale === "ar" ? "الإعدادات" : "Settings",
      );
    }
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

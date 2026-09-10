// @vitest-environment node
import { spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import {
  extractReleaseNotes,
  parseReleaseTag,
  validateReleaseFiles,
  validateStableDistribution,
} from "./release-utils.mjs";

const temporaryDirectories = [];
const fixturePrefix = path.join(os.tmpdir(), "hakawati-release-");
const scriptPath = (name) => fileURLToPath(new URL(name, import.meta.url));

function runScript(root, name, args, env = {}) {
  return spawnSync(process.execPath, [scriptPath(name), ...args], {
    cwd: root,
    env: {
      ...process.env,
      GITHUB_OUTPUT: path.join(root, "github-output"),
      ...env,
    },
    encoding: "utf8",
  });
}

async function createFixture(version = "1.0.0-1") {
  const root = await mkdtemp(fixturePrefix);
  temporaryDirectories.push(root);
  await mkdir(path.join(root, "src-tauri"));
  const files = {
    "package.json": JSON.stringify({ name: "hakawati", version }),
    "package-lock.json": JSON.stringify({
      version,
      packages: { "": { version } },
    }),
    "src-tauri/tauri.conf.json": JSON.stringify({ version }),
    "src-tauri/Cargo.toml": `[package]\nname = "hakawati"\nversion = "${version}"\n\n[dependencies]\nother = "2"\n`,
    "src-tauri/Cargo.lock": `version = 4\n\n[[package]]\nname = "dependency"\nversion = "9.0.0"\n\n[[package]]\nname = "hakawati"\nversion = "${version}"\n`,
    "CHANGELOG.md": `# Changelog\n\n## [Unreleased]\n\n## [v${version}] - 2026-09-10\n\n### Added\n\n- Desktop sync.\n\n## [v0.15.2]\n\n- Old notes.\n`,
  };
  await Promise.all(
    Object.entries(files).map(([name, content]) =>
      writeFile(path.join(root, name), content),
    ),
  );
  return root;
}

afterEach(async () => {
  for (const root of temporaryDirectories.splice(0)) {
    if (!path.resolve(root).startsWith(path.resolve(fixturePrefix))) {
      throw new Error("Refusing cleanup outside the test fixture prefix.");
    }
    await rm(root, { recursive: true, force: true });
  }
});

describe("release tags and notes", () => {
  it.each([
    ["v1.0.0", false],
    ["v0.16.0-beta.1", true],
    ["v1.0.0-rc.2+build.3", true],
    ["v1.0.0+build.3", false],
    ["v1.0.0-0.alpha-1", true],
  ])("recognizes %s prerelease status", (tag, prerelease) => {
    expect(parseReleaseTag(tag)).toEqual({
      tag,
      version: tag.slice(1),
      prerelease,
    });
  });

  it.each([
    "main",
    "release/v1.0.0",
    "refs/tags/v1.0.0",
    "1.0.0",
    "v01.0.0",
    "v1.0",
    "v1.0.0-01",
    "v1.0.0-",
    "v1.0.0\n",
    "v1.0.0\nprerelease=false",
    undefined,
  ])("rejects malformed or branch ref %s", (tag) => {
    expect(() => parseReleaseTag(tag)).toThrow(/SemVer/);
  });

  it("extracts an exact section with Windows line endings and stops at the next heading", () => {
    expect(
      extractReleaseNotes(
        "## [v1.0.0-1]\r\n\r\nBeta only.\r\n\r\n## [v1.0.0]\r\n\r\nStable.\r\nEOF\r\n\r\n## Other notes\r\n\r\nExclude this.",
        "v1.0.0",
      ),
    ).toBe("Stable.\nEOF");
  });

  it.each([
    "## [v1.0.01]\nWrong version.",
    "## [v1.0.0-1]\nBeta notes.",
    "## [v1.0.0]\n\n## [v0.15.2]\nOld notes.",
    "## [v1.0.0]\nFirst.\n\n## [v1.0.0]\nDuplicate.",
  ])("refuses missing, empty, or ambiguous notes", (changelog) => {
    expect(() => extractReleaseNotes(changelog, "v1.0.0")).toThrow();
  });
});

describe("release file consistency", () => {
  it("validates a synchronized beta across all manifests and lock files", async () => {
    const root = await createFixture();
    await expect(validateReleaseFiles(root, "v1.0.0-1")).resolves.toEqual({
      tag: "v1.0.0-1",
      version: "1.0.0-1",
      prerelease: true,
      notes: "### Added\n\n- Desktop sync.",
    });
  });

  it.each([
    ["package.json", '"version":"1.0.0-1"', '"version":"0.15.2"'],
    ["package-lock.json", '"version":"1.0.0-1"', '"version":"0.15.2"'],
    [
      "package-lock.json",
      '"":{"version":"1.0.0-1"}',
      '"":{"version":"0.15.2"}',
    ],
    ["src-tauri/tauri.conf.json", '"version":"1.0.0-1"', '"version":"0.15.2"'],
    ["src-tauri/Cargo.toml", 'version = "1.0.0-1"', 'version = "0.15.2"'],
    ["src-tauri/Cargo.lock", 'version = "1.0.0-1"', 'version = "0.15.2"'],
  ])("rejects version drift in %s", async (file, from, to) => {
    const root = await createFixture();
    const filename = path.join(root, file);
    await writeFile(
      filename,
      (await readFile(filename, "utf8")).replace(from, to),
    );
    await expect(validateReleaseFiles(root, "v1.0.0-1")).rejects.toThrow(
      /requires version/,
    );
  });

  it("rejects a matching version when only Unreleased notes exist", async () => {
    const root = await createFixture();
    await writeFile(
      path.join(root, "CHANGELOG.md"),
      "## [Unreleased]\n\n- Desktop sync.\n",
    );
    await expect(validateReleaseFiles(root, "v1.0.0-1")).rejects.toThrow(
      /heading/,
    );
  });

  it.each(["1.0.0-beta.1", "1.0.0+build.3"])(
    "rejects %s before packaging when MSI cannot convert it",
    async (version) => {
      const root = await createFixture(version);
      await expect(validateReleaseFiles(root, `v${version}`)).rejects.toThrow(
        /Windows MSI bundler requires a numeric/,
      );
    },
  );

  it.each(["256.0.0", "1.256.0", "1.0.65536", "1.0.0-65536", "1.0.0+65536"])(
    "rejects MSI component overflow in %s",
    async (version) => {
      const root = await createFixture(version);
      await expect(validateReleaseFiles(root, `v${version}`)).rejects.toThrow(
        /component limits/,
      );
    },
  );

  it("accepts a named beta only when a numeric WiX override was explicitly configured", async () => {
    const root = await createFixture("1.0.0-beta.1");
    await writeFile(
      path.join(root, "src-tauri/tauri.conf.json"),
      JSON.stringify({
        version: "1.0.0-beta.1",
        bundle: { windows: { wix: { version: "1.0.0.1" } } },
      }),
    );
    await expect(
      validateReleaseFiles(root, "v1.0.0-beta.1"),
    ).resolves.toMatchObject({ prerelease: true });
  });

  it.each(["1.0", "1.0.0.beta", "1.0.0.65536", "256.0.0", "1.0.0.1.2"])(
    "rejects malformed or overflowing explicit WiX override %s",
    async (wixVersion) => {
      const root = await createFixture();
      await writeFile(
        path.join(root, "src-tauri/tauri.conf.json"),
        JSON.stringify({
          version: "1.0.0-1",
          bundle: { windows: { wix: { version: wixVersion } } },
        }),
      );
      await expect(validateReleaseFiles(root, "v1.0.0-1")).rejects.toThrow(
        /MSI/,
      );
    },
  );
});

describe("manual release dispatch", () => {
  it("emits release metadata only when HEAD matches the selected tag", async () => {
    const root = await createFixture();
    const git = (...args) => {
      const result = spawnSync("git", args, {
        cwd: root,
        encoding: "utf8",
      });
      expect(result.status, result.stderr).toBe(0);
    };
    git("init");
    git("config", "user.name", "Release test");
    git("config", "user.email", "release@example.test");
    git("config", "commit.gpgsign", "false");
    git("commit", "--allow-empty", "-m", "Release");
    git("tag", "v1.0.0-1");
    const env = {
      GITHUB_REF_TYPE: "tag",
      GITHUB_REF_NAME: "v1.0.0-1",
      GITHUB_REF: "refs/tags/v1.0.0-1",
    };
    const result = runScript(root, "release-validate.mjs", ["--tag-ref"], env);
    expect(result.status, result.stderr).toBe(0);
    const output = path.join(root, "github-output");
    const metadata = await readFile(output, "utf8");
    expect(metadata).toBe("tag=v1.0.0-1\nversion=1.0.0-1\nprerelease=true\n");

    git("commit", "--allow-empty", "-m", "Unreleased change");
    const rejected = runScript(
      root,
      "release-validate.mjs",
      ["--tag-ref"],
      env,
    );
    expect(rejected.status).toBe(1);
    expect(rejected.stderr).toMatch(/does not match existing tag/);
    expect(await readFile(output, "utf8")).toBe(metadata);
  });

  it("rejects a version-shaped branch without emitting release metadata", async () => {
    const root = await createFixture();
    const result = runScript(root, "release-validate.mjs", ["--tag-ref"], {
      GITHUB_REF_TYPE: "branch",
      GITHUB_REF_NAME: "v1.0.0-1",
      GITHUB_REF: "refs/heads/v1.0.0-1",
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/branch dispatch/);
    await expect(readFile(path.join(root, "github-output"))).rejects.toThrow();
  });
});

describe("stable itch.io channels", () => {
  const published = { tagName: "v1.0.0", isDraft: false, isPrerelease: false };

  it("allows a published stable release", () => {
    expect(validateStableDistribution("v1.0.0", published).version).toBe(
      "1.0.0",
    );
  });

  it.each([
    ["v1.0.0", { ...published, isDraft: true }],
    ["v1.0.0", { ...published, isPrerelease: true }],
    ["v1.0.0", { ...published, tagName: "v0.15.2" }],
    ["v1.0.0", { tagName: "v1.0.0" }],
  ])(
    "blocks unsafe metadata for %s, including manual distribution",
    (tag, metadata) => {
      expect(() => validateStableDistribution(tag, metadata)).toThrow(
        /published, stable/,
      );
    },
  );

  it("fails the distribution command for a beta accidentally marked stable on GitHub", async () => {
    const root = await createFixture();
    const metadataFile = path.join(root, "release.json");
    await writeFile(
      metadataFile,
      JSON.stringify({ ...published, tagName: "v1.0.0-1" }),
    );
    const result = runScript(root, "release-distribution.mjs", [
      "v1.0.0-1",
      metadataFile,
    ]);
    expect(result.status).toBe(1);
    expect(result.stderr).toMatch(/published, stable/);
    await expect(readFile(path.join(root, "github-output"))).rejects.toThrow();
  });
});

import { readFile } from "node:fs/promises";
import path from "node:path";

// SemVer identifiers permit letters and hyphens, but numeric prerelease
// identifiers cannot have leading zeroes.
const NUMBER = "(?:0|[1-9][0-9]*)";
const PRERELEASE = `(?:${NUMBER}|[0-9]*[A-Za-z-][0-9A-Za-z-]*)`;
const TAG_PATTERN = new RegExp(
  `^v(${NUMBER}\\.${NUMBER}\\.${NUMBER})(?:-(${PRERELEASE}(?:\\.${PRERELEASE})*))?(?:\\+([0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*))?$`,
);

export function parseReleaseTag(tag) {
  const match = typeof tag === "string" && tag.match(TAG_PATTERN);
  if (!match || match[0] !== tag) {
    throw new Error(
      `Expected a v-prefixed SemVer tag, received ${JSON.stringify(tag)}.`,
    );
  }
  return { tag, version: tag.slice(1), prerelease: Boolean(match[2]) };
}

function validateWindowsInstallerVersion(tauri, tag) {
  const [, core, prerelease, build] = tag.match(TAG_PATTERN);
  const override = tauri.bundle?.windows?.wix?.version;
  const numericVersion =
    override ??
    `${core}${build || prerelease ? `.${build || prerelease}` : ""}`;
  if (
    typeof numericVersion !== "string" ||
    !/^[0-9]+\.[0-9]+\.[0-9]+(?:\.[0-9]+)?$/.test(numericVersion)
  ) {
    throw new Error(
      "The locked Tauri Windows MSI bundler requires a numeric prerelease (for example v0.16.0-1), numeric build metadata, or an explicit numeric bundle.windows.wix.version. Named beta tags need an intentional WiX version configuration and installer upgrade testing.",
    );
  }
  const limits = [255, 255, 65535, 65535];
  if (
    numericVersion
      .split(".")
      .some((part, index) => Number(part) > limits[index])
  ) {
    throw new Error(
      `Windows MSI version ${numericVersion} exceeds its component limits (255.255.65535.65535).`,
    );
  }
}

export function extractReleaseNotes(changelog, tag) {
  parseReleaseTag(tag);
  const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const text = changelog.replace(/\r\n/g, "\n");
  const matches = [
    ...text.matchAll(new RegExp(`^## \\[${escapedTag}\\](?:[ \\t].*)?$`, "gm")),
  ];
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one CHANGELOG.md heading for [${tag}], found ${matches.length}.`,
    );
  }
  const heading = matches[0];
  const remainder = text.slice(heading.index + heading[0].length);
  const nextHeading = remainder.search(/^## /m);
  const notes = (
    nextHeading < 0 ? remainder : remainder.slice(0, nextHeading)
  ).trim();
  if (!notes) {
    throw new Error(`Found heading for "${tag}" but the section is empty.`);
  }
  return notes;
}

function tomlString(section, key, source) {
  const match = section?.match(
    new RegExp(`^${key}\\s*=\\s*["']([^"'\\r\\n]+)["'][ \\t]*(?:#.*)?$`, "m"),
  );
  if (!match) throw new Error(`Cannot read ${key} from ${source}.`);
  return match[1];
}

export async function validateReleaseFiles(root, tag) {
  const release = parseReleaseTag(tag);
  const filenames = [
    "package.json",
    "package-lock.json",
    "src-tauri/tauri.conf.json",
    "src-tauri/Cargo.toml",
    "src-tauri/Cargo.lock",
    "CHANGELOG.md",
  ];
  const [packageRaw, npmLockRaw, tauriRaw, cargoRaw, cargoLockRaw, changelog] =
    await Promise.all(
      filenames.map((filename) => readFile(path.join(root, filename), "utf8")),
    );
  const pkg = JSON.parse(packageRaw);
  const npmLock = JSON.parse(npmLockRaw);
  const tauri = JSON.parse(tauriRaw);
  const cargoPackage = cargoRaw
    .replace(/\r\n/g, "\n")
    .split(/^\[package\][ \t]*(?:#.*)?$/m)[1]
    ?.split(/^\[/m)[0];
  const cargoName = tomlString(cargoPackage, "name", "Cargo.toml [package]");
  const lockPackages = cargoLockRaw
    .replace(/\r\n/g, "\n")
    .split(/^\[\[package\]\][ \t]*$/m)
    .slice(1);
  const appPackages = lockPackages.filter(
    (section) => tomlString(section, "name", "Cargo.lock") === cargoName,
  );
  if (appPackages.length !== 1) {
    throw new Error(
      `Expected exactly one ${cargoName} package in Cargo.lock, found ${appPackages.length}.`,
    );
  }
  const versions = {
    "package.json": pkg.version,
    "package-lock.json": npmLock.version,
    'package-lock.json packages[""]': npmLock.packages?.[""]?.version,
    "src-tauri/tauri.conf.json": tauri.version,
    "src-tauri/Cargo.toml [package]": tomlString(
      cargoPackage,
      "version",
      "Cargo.toml",
    ),
    [`src-tauri/Cargo.lock ${cargoName}`]: tomlString(
      appPackages[0],
      "version",
      "Cargo.lock",
    ),
  };
  const mismatches = Object.entries(versions).filter(
    ([, version]) => version !== release.version,
  );
  if (mismatches.length) {
    throw new Error(
      `Release ${tag} requires version ${release.version} everywhere:\n${mismatches.map(([file, version]) => `- ${file}: ${version ?? "missing"}`).join("\n")}`,
    );
  }
  validateWindowsInstallerVersion(tauri, tag);
  return { ...release, notes: extractReleaseNotes(changelog, tag) };
}

export function validateTagRef(env, tag) {
  parseReleaseTag(tag);
  if (
    env.GITHUB_REF_TYPE !== "tag" ||
    env.GITHUB_REF !== `refs/tags/${tag}` ||
    env.GITHUB_REF_NAME !== tag
  ) {
    throw new Error(
      "Release must run on an existing tag ref. For a manual run, select the existing release tag with gh workflow run release.yml --ref <tag>; branch dispatch is not allowed.",
    );
  }
}

export function validateStableDistribution(tag, metadata) {
  const release = parseReleaseTag(tag);
  if (
    metadata.tagName !== tag ||
    metadata.isDraft !== false ||
    metadata.isPrerelease !== false ||
    release.prerelease
  ) {
    throw new Error(
      "itch.io distribution requires a published, stable release whose tag matches the requested tag. Draft and prerelease builds cannot use the stable channels.",
    );
  }
  return release;
}

import { mkdir, readFile, writeFile, appendFile } from "fs/promises";
import path from "path";

const TAG_ENV_KEYS = [
  "GITHUB_REF_NAME",
  "TAURI_REF_NAME",
  "RELEASE_TAG",
] as const;

function getTagFromEnv(): string | null {
  for (const key of TAG_ENV_KEYS) {
    const value = process.env[key];
    if (value && value.trim()) {
      return sanitizeRef(value.trim());
    }
  }
  return null;
}

function sanitizeRef(ref: string): string {
  const parts = ref.split("/");
  return parts[parts.length - 1] ?? ref;
}

function escapeRegex(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function extractNotes(tag: string): Promise<string> {
  const changelogPath = path.resolve(process.cwd(), "CHANGELOG.md");
  const changelogRaw = await readFile(changelogPath, "utf8");
  const changelog = changelogRaw.replace(/\r\n/g, "\n");

  const escapedTag = escapeRegex(tag);

  const headingPattern = new RegExp(
    `^## \\[[^\n]*${escapedTag}[^\n]*\\].*$`,
    "m",
  );
  const headingMatch = changelog.match(headingPattern);

  if (!headingMatch || headingMatch.index === undefined) {
    throw new Error(
      `Could not find release notes for tag "${tag}" in CHANGELOG.md.`,
    );
  }

  const headingEndIndex = headingMatch.index + headingMatch[0].length;

  const nextHeadingPattern = /^## \[/m;
  const restOfChangelog = changelog.substring(headingEndIndex + 1);
  const nextMatch = restOfChangelog.match(nextHeadingPattern);

  let body: string;
  if (nextMatch && nextMatch.index !== undefined) {
    body = restOfChangelog.substring(0, nextMatch.index).trim();
  } else {
    body = restOfChangelog.trim();
  }

  if (!body) {
    throw new Error(`Found heading for "${tag}" but the section is empty.`);
  }

  return body;
}

async function main() {
  const tag = getTagFromEnv() ?? process.argv[2];

  if (!tag) {
    throw new Error("Release tag is not specified.");
  }

  const notes = await extractNotes(tag);

  const artifactsDir = path.resolve(process.cwd(), "artifacts");
  const outputPath = path.join(artifactsDir, "release-notes.md");

  await mkdir(artifactsDir, { recursive: true });
  await writeFile(outputPath, `${notes}\n`, "utf8");

  const githubOutput = process.env.GITHUB_OUTPUT;
  if (githubOutput) {
    const payload = `release_body<<EOF\n${notes}\nEOF\n`;
    await appendFile(githubOutput, payload);
  }

  process.stdout.write(`Release notes for ${tag} written to ${outputPath}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

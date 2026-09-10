import { mkdir, readFile, writeFile, appendFile } from "fs/promises";
import path from "path";
import { randomUUID } from "node:crypto";
import { extractReleaseNotes } from "./release-utils.mjs";

const TAG_ENV_KEYS = [
  "RELEASE_TAG",
  "GITHUB_REF_NAME",
  "TAURI_REF_NAME",
] as const;

function getTagFromEnv(): string | null {
  for (const key of TAG_ENV_KEYS) {
    const value = process.env[key];
    if (value && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

async function extractNotes(tag: string): Promise<string> {
  const changelogPath = path.resolve(process.cwd(), "CHANGELOG.md");
  const changelogRaw = await readFile(changelogPath, "utf8");
  return extractReleaseNotes(changelogRaw, tag);
}

async function main() {
  const tag = process.argv[2] ?? getTagFromEnv();

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
    const delimiter = `RELEASE_NOTES_${randomUUID()}`;
    const payload = `release_body<<${delimiter}\n${notes}\n${delimiter}\n`;
    await appendFile(githubOutput, payload);
  }

  process.stdout.write(`Release notes for ${tag} written to ${outputPath}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

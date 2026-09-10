import { mkdir, readFile, writeFile, appendFile } from "fs/promises";
import path from "path";
import { randomUUID } from "node:crypto";
import { extractReleaseNotes } from "./release-utils.mjs";

try {
  const tag =
    process.argv[2] ??
    ["RELEASE_TAG", "GITHUB_REF_NAME", "TAURI_REF_NAME"]
      .map((key) => process.env[key]?.trim())
      .find(Boolean);

  if (!tag) {
    throw new Error("Release tag is not specified.");
  }

  const notes = extractReleaseNotes(
    await readFile("CHANGELOG.md", "utf8"),
    tag,
  );

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
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

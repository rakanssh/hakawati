import console from "node:console";
import { appendFile, readFile } from "node:fs/promises";
import process from "node:process";
import { validateStableDistribution } from "./release-utils.mjs";

try {
  const [tag, metadataPath] = process.argv.slice(2);
  const metadata = JSON.parse(await readFile(metadataPath, "utf8"));
  const release = validateStableDistribution(tag, metadata);
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `version=${release.version}\n`);
  }
  console.log(
    `Validated published stable release ${release.tag} for itch.io distribution.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

import { execFileSync } from "node:child_process";
import console from "node:console";
import { appendFile } from "node:fs/promises";
import process from "node:process";
import { validateReleaseFiles, validateTagRef } from "./release-utils.mjs";

try {
  const requireTagRef = process.argv[2] === "--tag-ref";
  const tag = requireTagRef ? process.env.GITHUB_REF_NAME : process.argv[2];
  if (requireTagRef) {
    validateTagRef(process.env, tag);
    const revision = (ref) =>
      execFileSync("git", ["rev-parse", "--verify", ref], {
        encoding: "utf8",
      }).trim();
    if (revision(`refs/tags/${tag}^{commit}`) !== revision("HEAD")) {
      throw new Error(`Checked-out commit does not match existing tag ${tag}.`);
    }
  }
  const release = await validateReleaseFiles(process.cwd(), tag);
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `tag=${release.tag}\nversion=${release.version}\nprerelease=${release.prerelease}\n`,
    );
  }
  console.log(
    `Validated ${release.tag}: all package versions match and release notes exist (${release.prerelease ? "prerelease" : "stable"}).`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}

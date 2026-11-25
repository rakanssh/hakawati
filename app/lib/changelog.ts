import changelogText from "../../CHANGELOG.md?raw";

export type ChangelogRelease = { version: string; notes: string };

export function parseChangelog(text: string): ChangelogRelease[] {
  const source = text.replace(/\r\n?/g, "\n");
  const headings = [...source.matchAll(/^## .*$/gm)];
  return headings.flatMap((heading, index) => {
    const version = heading[0].match(/^## \[v([^\]\s]+)\]/)?.[1];
    if (!version) return [];
    const notes = source
      .slice(
        heading.index + heading[0].length,
        headings[index + 1]?.index ?? source.length,
      )
      .trim();
    return notes ? [{ version, notes }] : [];
  });
}

function parts(version: string) {
  const [core, prerelease] = version.split("+")[0].split(/-(.*)/s);
  return { core: core.split(".").map(Number), prerelease };
}

export function compareVersions(a: string, b: string): number {
  const left = parts(a);
  const right = parts(b);
  for (let index = 0; index < 3; index += 1) {
    const difference = (left.core[index] ?? 0) - (right.core[index] ?? 0);
    if (difference) return difference;
  }
  if (left.prerelease === right.prerelease) return 0;
  if (!left.prerelease) return 1;
  if (!right.prerelease) return -1;
  return left.prerelease.localeCompare(right.prerelease, undefined, {
    numeric: true,
  });
}

/**
 * Releases in the current version's minor line (1.5.x for 1.5.2) that came after
 * `lastSeen`, newest first. Earlier lines are left out, however long ago `lastSeen` was.
 */
export function unseenReleases(
  current: string,
  lastSeen: string | null,
  releases: ChangelogRelease[] = changelogReleases,
): ChangelogRelease[] {
  const [major, minor] = parts(current).core;
  return releases
    .filter((release) => {
      const [releaseMajor, releaseMinor] = parts(release.version).core;
      return (
        releaseMajor === major &&
        releaseMinor === minor &&
        compareVersions(release.version, current) <= 0 &&
        (lastSeen === null || compareVersions(release.version, lastSeen) > 0)
      );
    })
    .sort((a, b) => compareVersions(b.version, a.version));
}

export const changelogReleases = parseChangelog(changelogText);

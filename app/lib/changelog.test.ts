import { describe, expect, it } from "vitest";
import {
  changelogReleases,
  compareVersions,
  parseChangelog,
  unseenReleases,
} from "./changelog";

const changelog = `# Changelog

## [Unreleased]

### Fixed

- Not released yet.

## [v1.5.2] - 2026-12-02

### Fixed

- Two.

## [v1.5.1] - 2026-11-26

### Fixed

- One.

## [v1.5.0] - 2026-11-25

### Added

- Zero.

## [v1.4.0] - 2026-11-21

### Added

- Older.
`;

const releases = parseChangelog(changelog);
const versions = (current: string, lastSeen: string | null) =>
  unseenReleases(current, lastSeen, releases).map((release) => release.version);

describe("changelog", () => {
  it("reads each released version's notes and skips Unreleased", () => {
    expect(releases.map((release) => release.version)).toEqual([
      "1.5.2",
      "1.5.1",
      "1.5.0",
      "1.4.0",
    ]);
    expect(releases[1].notes).toBe("### Fixed\n\n- One.");
  });

  it("shows every unseen release in the current minor line, newest first", () => {
    expect(versions("1.5.2", "1.4.0")).toEqual(["1.5.2", "1.5.1", "1.5.0"]);
    expect(versions("1.5.2", "1.2.3")).toEqual(["1.5.2", "1.5.1", "1.5.0"]);
    expect(versions("1.5.2", "1.5.0")).toEqual(["1.5.2", "1.5.1"]);
    expect(versions("1.5.1", null)).toEqual(["1.5.1", "1.5.0"]);
  });

  it("shows nothing once the current version has been seen or for a downgrade", () => {
    expect(versions("1.5.2", "1.5.2")).toEqual([]);
    expect(versions("1.5.1", "1.5.2")).toEqual([]);
    expect(versions("1.6.0", "1.5.2")).toEqual([]);
  });

  it("orders prereleases before their release", () => {
    expect(compareVersions("1.5.0-1", "1.5.0")).toBeLessThan(0);
    expect(compareVersions("1.5.0-2", "1.5.0-10")).toBeLessThan(0);
    expect(compareVersions("1.10.0", "1.9.9")).toBeGreaterThan(0);
  });

  it("bundles this repository's changelog", () => {
    expect(changelogReleases.length).toBeGreaterThan(0);
    expect(changelogReleases[0].notes).toMatch(/^### /);
  });
});

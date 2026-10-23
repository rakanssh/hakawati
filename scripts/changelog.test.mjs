// @vitest-environment node
import { readFileSync } from "node:fs";
import { URL } from "node:url";
import { describe, expect, it } from "vitest";
import { extractReleaseNotes, parseReleaseTag } from "./release-utils.mjs";

const SECTIONS = ["Added", "Changed", "Fixed", "Removed"];
const changelog = readFileSync(
  new URL("../CHANGELOG.md", import.meta.url),
  "utf8",
).replace(/\r\n/g, "\n");

function releases() {
  const headings = [...changelog.matchAll(/^## (.*)$/gm)];
  return headings.map((heading, index) => ({
    heading: heading[1],
    body: changelog.slice(
      heading.index + heading[0].length,
      headings[index + 1]?.index ?? changelog.length,
    ),
  }));
}

function compareVersions(a, b) {
  const parts = (version) => version.split(/[-+]/)[0].split(".").map(Number);
  const [left, right] = [parts(a), parts(b)];
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return Number(!a.includes("-")) - Number(!b.includes("-"));
}

describe("CHANGELOG.md", () => {
  it("names each release with its tag and date, newest first", () => {
    const [first, ...rest] = releases();
    expect(first.heading).toBe("[Unreleased]");
    const versions = rest.map(({ heading }) => {
      const match = heading.match(/^\[(v[^\]]+)\] - (\d{4}-\d{2}-\d{2})$/);
      expect(match, heading).not.toBeNull();
      expect(Number.isNaN(Date.parse(match[2])), heading).toBe(false);
      return parseReleaseTag(match[1]).version;
    });
    for (let index = 1; index < versions.length; index += 1) {
      expect(
        compareVersions(versions[index - 1], versions[index]),
        `${versions[index - 1]} before ${versions[index]}`,
      ).toBeGreaterThan(0);
    }
  });

  it("lists changes under Added, Changed, Fixed and Removed, in that order", () => {
    for (const { heading, body } of releases()) {
      const sections = [];
      for (const line of body.split("\n")) {
        if (!line.trim()) continue;
        const section = line.match(/^### (.*)$/);
        if (section) {
          expect(SECTIONS, `${heading}: ${line}`).toContain(section[1]);
          sections.push({ name: section[1], items: 0 });
          continue;
        }
        expect(line, heading).toMatch(/^- \S/);
        expect(sections.length, `${heading}: ${line}`).toBeGreaterThan(0);
        sections.at(-1).items += 1;
      }
      const order = sections.map(({ name }) => SECTIONS.indexOf(name));
      expect(order, heading).toEqual([...new Set(order)].sort());
      for (const { name, items } of sections) {
        expect(items, `${heading} ${name}`).toBeGreaterThan(0);
      }
      if (heading !== "[Unreleased]") {
        expect(sections.length, heading).toBeGreaterThan(0);
      }
    }
  });

  it("gives the release workflow notes for every tagged version", () => {
    for (const { heading } of releases().slice(1)) {
      const tag = heading.match(/^\[(v[^\]]+)\]/)[1];
      expect(extractReleaseNotes(changelog, tag)).toMatch(/^### /);
    }
  });
});

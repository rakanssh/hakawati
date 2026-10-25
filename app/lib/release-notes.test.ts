import { describe, expect, it } from "vitest";
import changelog from "../../CHANGELOG.md?raw";
import { parseReleaseNotes } from "./release-notes";

describe("parseReleaseNotes", () => {
  it("splits a changelog section into its headings and changes", () => {
    expect(
      parseReleaseNotes(
        "### Added\r\n\r\n- Themes.\r\n- A story panel.\r\n\r\n### Fixed\r\n\r\n- Stop works.\r\n\r\n### Removed\r\n\r\n- Bamboo.",
      ),
    ).toEqual([
      { kind: "added", title: "Added", items: ["Themes.", "A story panel."] },
      { kind: "fixed", title: "Fixed", items: ["Stop works."] },
      { kind: "removed", title: "Removed", items: ["Bamboo."] },
    ]);
  });

  it("keeps wrapped lines and nested lists with their change", () => {
    expect(
      parseReleaseNotes(
        "### Changed\n\n- Settings\nopen in a window.\n  - On desktop only.\n\n  Keys carry over.\n- **Brass Night** is the default.",
      ),
    ).toEqual([
      {
        kind: "changed",
        title: "Changed",
        items: [
          "Settings\nopen in a window.\n- On desktop only.\n\nKeys carry over.",
          "**Brass Night** is the default.",
        ],
      },
    ]);
  });

  it("keeps headings it has no label for, and changes listed without one", () => {
    expect(
      parseReleaseNotes("- Faster saves.\n\n## Security\n\n* Safer links."),
    ).toEqual([
      { kind: "other", title: "", items: ["Faster saves."] },
      { kind: "other", title: "Security", items: ["Safer links."] },
    ]);
  });

  it.each([
    "",
    "### Added\n\n",
    "Hakawati 1.3 is out.\n\n- Themes.",
    "### Added\n\n- Themes.\n\nSee the website for more.",
    "1. Numbered change.",
  ])("returns null for notes that aren't a changelog section: %j", (notes) => {
    expect(parseReleaseNotes(notes)).toBeNull();
  });

  it("reads every release in CHANGELOG.md", () => {
    const releases = changelog
      .replace(/\r\n/g, "\n")
      .split(/^## .*$/m)
      .slice(1)
      .filter((notes) => notes.trim());
    expect(releases.length).toBeGreaterThan(30);
    for (const notes of releases) {
      const sections = parseReleaseNotes(notes.trim());
      expect(sections, notes).not.toBeNull();
      expect(sections!.map(({ kind }) => kind)).not.toContain("other");
      expect(sections!.flatMap(({ items }) => items)).toHaveLength(
        notes.match(/^- /gm)!.length,
      );
    }
  });
});

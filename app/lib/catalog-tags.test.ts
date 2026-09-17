import { describe, expect, it } from "vitest";
import { validateCatalogTags } from "./catalog-tags";

describe("catalog tags", () => {
  it("normalizes, de-dupes, and validates catalog tags", () => {
    const result = validateCatalogTags([
      " Sci Fi ",
      "sci_fi",
      "sci---fi",
      "Bad!",
      "a".repeat(33),
    ]);

    expect(result.tags).toEqual(["sci-fi"]);
    expect(result.invalid).toEqual(["Bad!"]);
    expect(result.tooLong).toEqual(["a".repeat(33)]);
  });

  it("accepts Unicode tags and normalizes equivalent spellings", () => {
    const result = validateCatalogTags([
      " خيال علمي ",
      "خَيَال",
      "cafe\u0301",
      "CAFÉ",
      "ＳＣＩ＿ＦＩ",
      "sci-fi",
      "世界",
      "story✨",
    ]);

    expect(result.tags).toEqual([
      "خيال-علمي",
      "خَيَال",
      "café",
      "sci-fi",
      "世界",
    ]);
    expect(result.invalid).toEqual(["story✨"]);
  });

  it("enforces tag count and normalized length limits", () => {
    const tags = Array.from({ length: 17 }, (_, index) => `tag-${index}`);
    expect(validateCatalogTags(tags)).toMatchObject({
      tags: tags.slice(0, 16),
      tooMany: true,
    });
    expect(validateCatalogTags(["ع".repeat(32), "ع".repeat(33)])).toMatchObject(
      {
        tags: ["ع".repeat(32)],
        tooLong: ["ع".repeat(33)],
      },
    );
  });
});

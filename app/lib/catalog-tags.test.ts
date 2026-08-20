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
});

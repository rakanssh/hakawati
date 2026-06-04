import { describe, expect, it } from "vitest";
import { ApiPreset } from "@/types";
import { getApiPresetsForRole } from "./api-presets";

describe("getApiPresetsForRole", () => {
  it("keeps all presets available for text roles", () => {
    expect(getApiPresetsForRole("narrator").map((preset) => preset.id)).toEqual(
      [
        ApiPreset.OPENROUTER,
        ApiPreset.NANOGPT,
        ApiPreset.VENICE,
        ApiPreset.OPENAI,
        ApiPreset.GENERIC,
        ApiPreset.LOCAL,
      ],
    );
  });

  it("limits audio roles to providers that are useful for audio models", () => {
    expect(
      getApiPresetsForRole("speechToText").map((preset) => preset.id),
    ).toEqual([
      ApiPreset.OPENROUTER,
      ApiPreset.OPENAI,
      ApiPreset.GENERIC,
      ApiPreset.LOCAL,
    ]);
  });
});

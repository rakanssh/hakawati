import { describe, expect, it } from "vitest";
import {
  normalizePromptComponents,
  TALE_COMPONENT_TYPES,
} from "./prompt-components";
import { PromptComponentType } from "@/types/context.type";

describe("prompt components", () => {
  it("keeps only the first component for each singleton type", () => {
    const components = normalizePromptComponents(
      [
        {
          id: "plot-1",
          type: PromptComponentType.PLOT,
          content: "First plot",
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: "plot-2",
          type: PromptComponentType.PLOT,
          content: "Second plot",
          createdAt: 2,
          updatedAt: 2,
        },
        {
          id: "opening-1",
          type: PromptComponentType.OPENING,
          content: "Opening",
          createdAt: 3,
          updatedAt: 3,
        },
      ],
      TALE_COMPONENT_TYPES,
    );

    expect(components).toEqual([
      {
        id: "plot-1",
        type: PromptComponentType.PLOT,
        content: "First plot",
        createdAt: 1,
        updatedAt: 1,
      },
    ]);
  });
});

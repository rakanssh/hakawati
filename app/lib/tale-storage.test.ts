import { describe, expect, it } from "vitest";
import { PromptComponentType, StorybookCategory } from "@/types/context.type";
import { LogEntryMode, LogEntryRole, type LogEntry } from "@/types/log.type";
import {
  createTaleSessionState,
  createTaleCurrentState,
  flattenTurns,
  sanitizeLogEntries,
  sanitizeTurnEntries,
} from "./tale-storage";

function entry(id: string, text = id): LogEntry {
  return {
    id,
    role: LogEntryRole.GM,
    mode: LogEntryMode.STORY,
    text,
  };
}

describe("tale storage helpers", () => {
  it("keeps migrated current state separate from log and undo data", () => {
    const state = createTaleCurrentState({
      components: [
        {
          id: "plot",
          type: PromptComponentType.PLOT,
          content: "Ancient ruins under the city.",
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      storyCards: [
        {
          id: "card",
          title: "The Gate",
          triggers: ["gate"],
          content: "The gate hums in moonlight.",
          category: StorybookCategory.PLACE,
          isPinned: true,
          createdAt: 2,
          updatedAt: 2,
        },
      ],
      stats: [{ name: "HP", value: 12, range: [0, 20] }],
      inventory: [{ id: "item", name: "Lantern" }],
    });

    expect(state.components).toHaveLength(1);
    expect(state.storyCards[0].title).toBe("The Gate");
    expect(state.gm.stats[0].name).toBe("HP");
    expect(state.gm.inventory[0].name).toBe("Lantern");
    expect(state.gm.scratchpad).toEqual({});
  });

  it("strips transient token counts before persistence or package export", () => {
    const clean = sanitizeLogEntries([
      {
        ...entry("entry-1"),
        _tokenCount: 42,
      },
    ]);

    expect(clean[0]).not.toHaveProperty("_tokenCount");
    expect(clean[0].id).toBe("entry-1");
  });

  it("preserves turn entry order when flattening package turns", () => {
    const entries = flattenTurns([
      { entries: [entry("one"), entry("two")] },
      { entries: [entry("three")] },
    ]);

    expect(entries.map((item) => item.id)).toEqual(["one", "two", "three"]);
  });

  it("rejects empty committed turns", () => {
    expect(() => sanitizeTurnEntries([])).toThrow(
      "Tale turns must contain at least one log entry",
    );
  });

  it("keeps undo data in local session state", () => {
    const session = createTaleSessionState({
      undoStack: [entry("undo-1")],
      editorState: { selected: "entry-1" },
    });

    expect(session.undoStack[0].id).toBe("undo-1");
    expect(session.editorState).toEqual({ selected: "entry-1" });
  });
});

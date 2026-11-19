import { describe, expect, it } from "vitest";
import { replyTimeline } from "./assistant-timeline";

describe("replyTimeline", () => {
  it("puts steps between the text written before and after them", () => {
    const parts = replyTimeline(
      "Let me look.\n\nShe first appears at the docks.",
      [
        { tool: "search_log", detail: "Mara", at: 12 },
        { tool: "read_log", at: 12 },
      ],
      false,
    );
    expect(parts).toEqual([
      { kind: "text", text: "Let me look." },
      {
        kind: "steps",
        steps: [
          {
            activity: { tool: "search_log", detail: "Mara", at: 12 },
            running: false,
          },
          { activity: { tool: "read_log", at: 12 }, running: false },
        ],
      },
      { kind: "text", text: "She first appears at the docks." },
    ]);
  });

  it("keeps steps from older replies, which have no position, first", () => {
    const parts = replyTimeline("Done.", [{ tool: "get_context" }], false);
    expect(parts.map((part) => part.kind)).toEqual(["steps", "text"]);
  });

  it("shows an edit while it runs and hides it once it worked", () => {
    const edit = { tool: "edit_story_cards", at: 5 };
    expect(replyTimeline("Sure.", [edit], true).at(-1)).toEqual({
      kind: "steps",
      steps: [{ activity: edit, running: true }],
    });
    expect(replyTimeline("Sure.", [edit], false)).toEqual([
      { kind: "text", text: "Sure." },
    ]);
    const failed = { ...edit, error: "No such card" };
    expect(replyTimeline("Sure.", [failed], false).at(-1)).toEqual({
      kind: "steps",
      steps: [{ activity: failed, running: false }],
    });
  });

  it("leaves out steps that changed something, which the reply lists as changes", () => {
    const set = { tool: "settings", action: "set", at: 5, changed: true };
    const look = { tool: "settings", action: "get", at: 5 };
    expect(replyTimeline("Done.", [set, look], false)).toEqual([
      { kind: "text", text: "Done." },
      { kind: "steps", steps: [{ activity: look, running: false }] },
    ]);
  });

  it("clamps positions past the end of the text", () => {
    const parts = replyTimeline("Hi.", [{ tool: "get_tale", at: 99 }], false);
    expect(parts.map((part) => part.kind)).toEqual(["text", "steps"]);
  });
});

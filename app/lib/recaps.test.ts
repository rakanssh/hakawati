import { describe, expect, it } from "vitest";
import { LogEntryMode, LogEntryRole, type LogEntry } from "@/types/log.type";
import {
  canApplyRecap,
  cleanRecapLines,
  isRecapPassage,
  parseRecapDraft,
  patchLogEntry,
  readRecap,
} from "./recaps";

const gm = (text: string, recap?: string[]): LogEntry => ({
  id: "gm-1",
  role: LogEntryRole.GM,
  mode: LogEntryMode.STORY,
  text,
  ...(recap ? { recap } : {}),
});

describe("story recap helpers", () => {
  it("counts narration with text as a passage, failed or not", () => {
    expect(isRecapPassage(gm("The gate opens."))).toBe(true);
    expect(isRecapPassage({ ...gm("The gate"), error: "Cut off" })).toBe(true);
    expect(isRecapPassage(gm("..."))).toBe(false);
    expect(isRecapPassage(gm("  \n"))).toBe(false);
    expect(
      isRecapPassage({
        ...gm("An error occurred while processing your request."),
        error: true,
      }),
    ).toBe(false);
    expect(
      isRecapPassage({ ...gm("I knock."), role: LogEntryRole.PLAYER }),
    ).toBe(false);
  });

  it("reads only string lines from a stored recap", () => {
    expect(readRecap({ recap: ["Mara left.", 3, null] })).toEqual([
      "Mara left.",
    ]);
    expect(readRecap({ recap: "Mara left." })).toBeUndefined();
    expect(readRecap({})).toBeUndefined();
  });

  it("drops a recap when the passage text really changes", () => {
    const entry = gm("Mara broke Tobin's nose.", ["Mara hit Tobin."]);

    expect(
      patchLogEntry(entry, { text: "Mara broke Tobin's nose. " }).recap,
    ).toEqual(["Mara hit Tobin."]);
    expect(
      patchLogEntry(entry, { text: "Mara spared Tobin." }).recap,
    ).toBeUndefined();
    expect(
      patchLogEntry(entry, { text: "Mara spared Tobin.", recap: ["Spared."] })
        .recap,
    ).toEqual(["Spared."]);
    expect(patchLogEntry(entry, { thinking: "Hmm" }).recap).toEqual([
      "Mara hit Tobin.",
    ]);
  });

  it("applies a written recap only to the text and recap it was made from", () => {
    const entry = gm("Mara left.");
    const write = {
      entryId: entry.id,
      lines: ["Mara left the inn."],
      sourceText: "Mara left. ",
      expectedRecap: undefined,
    };

    expect(canApplyRecap(entry, write)).toBe(true);
    expect(canApplyRecap({ ...entry, text: "Mara stayed." }, write)).toBe(
      false,
    );
    expect(canApplyRecap({ ...entry, recap: ["Edited."] }, write)).toBe(false);
    expect(
      canApplyRecap(
        { ...entry, recap: ["Edited."] },
        {
          ...write,
          expectedRecap: ["Edited."],
        },
      ),
    ).toBe(true);
  });

  it("cleans hand-written lines", () => {
    expect(
      parseRecapDraft("- Mara left.\n\n  * Tobin lied.  \n• Gate shut"),
    ).toEqual(["Mara left.", "Tobin lied.", "Gate shut"]);
    expect(
      cleanRecapLines(Array.from({ length: 9 }, (_, i) => `${i}`)),
    ).toHaveLength(6);
    expect(cleanRecapLines(["x".repeat(500)])[0]).toHaveLength(240);
  });
});

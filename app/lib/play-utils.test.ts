import { describe, expect, it, vi } from "vitest";
import { LogEntryMode, LogEntryRole } from "@/types/log.type";
import {
  getAutoNarrationItem,
  getLogBlockNarrationItem,
  getStoryEntryNarrationItem,
  groupLogEntriesIntoBlocks,
} from "./play-utils";

vi.mock("@lingui/core/macro", () => ({
  msg: (value: TemplateStringsArray | string) =>
    typeof value === "string" ? value : value.join(""),
}));

describe("play narration helpers", () => {
  it("creates merged narration text for continued GM blocks", () => {
    const blocks = groupLogEntriesIntoBlocks([
      {
        id: "gm-1",
        role: LogEntryRole.GM,
        mode: LogEntryMode.STORY,
        text: "The door opens.",
        chainId: "chain-1",
      },
      {
        id: "gm-2",
        role: LogEntryRole.GM,
        mode: LogEntryMode.STORY,
        text: " A shadow waits.",
        chainId: "chain-1",
      },
    ]);

    expect(getLogBlockNarrationItem(blocks[0])).toEqual({
      id: "gm:chain-1",
      text: "The door opens. A shadow waits.",
      label: "Story narration",
    });
  });

  it("creates narration items for Story-mode player entries only", () => {
    const storyEntry = {
      id: "player-1",
      role: LogEntryRole.PLAYER,
      mode: LogEntryMode.STORY,
      text: "Rain starts falling.",
    };
    const actionEntry = {
      id: "player-2",
      role: LogEntryRole.PLAYER,
      mode: LogEntryMode.DO,
      text: "Open the door.",
    };

    expect(getStoryEntryNarrationItem(storyEntry)).toEqual({
      id: "entry:player-1",
      text: "Rain starts falling.",
      label: "Story input",
    });
    expect(getStoryEntryNarrationItem(actionEntry)).toBeNull();
  });

  it("creates auto narration items for GM entries and Story-mode player entries", () => {
    expect(
      getAutoNarrationItem({
        id: "gm-1",
        role: LogEntryRole.GM,
        mode: LogEntryMode.STORY,
        text: "The hall is quiet.",
      }),
    ).toEqual({
      id: "auto:gm-1",
      text: "The hall is quiet.",
      label: "Story narration",
    });

    expect(
      getAutoNarrationItem({
        id: "player-1",
        role: LogEntryRole.PLAYER,
        mode: LogEntryMode.STORY,
        text: "A bell rings.",
      }),
    ).toEqual({
      id: "auto:player-1",
      text: "A bell rings.",
      label: "Story input",
    });
  });
});

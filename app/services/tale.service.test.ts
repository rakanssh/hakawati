import { describe, expect, it } from "vitest";
import { GameMode } from "@/types/context.type";
import { LogEntryRole } from "@/types/log.type";
import { deserializeTalePackage } from "./tale.service";

describe("tale package format", () => {
  it("parses portable tale content without carrying local session state", () => {
    const parsed = deserializeTalePackage(
      JSON.stringify({
        format: "hakawati-tale-package",
        formatVersion: 1,
        exportedAt: "2026-06-16T00:00:00.000Z",
        tale: {
          id: "tale-1",
          title: "Iron Valley",
          description: "A local tale export.",
          gameMode: GameMode.STORY_TELLER,
          createdAt: 1,
          updatedAt: 2,
          schemaVersion: 1,
        },
        state: {
          stateSchemaVersion: 1,
          data: {
            components: [],
            storyCards: [],
            gm: {
              stats: [],
              inventory: [],
              scratchpad: {},
            },
          },
        },
        turns: [
          {
            id: "turn-1",
            seq: 1,
            createdAt: 3,
            entries: [
              {
                id: "entry-1",
                role: LogEntryRole.GM,
                text: "The gate opened.",
              },
            ],
          },
        ],
        assets: [],
        session: {
          undoStack: [
            {
              id: "undo-1",
              role: LogEntryRole.GM,
              text: "Local only.",
            },
          ],
        },
      }),
    );

    expect(parsed.tale.title).toBe("Iron Valley");
    expect(parsed.turns[0].entries[0].text).toBe("The gate opened.");
    expect("session" in parsed).toBe(false);
  });
});

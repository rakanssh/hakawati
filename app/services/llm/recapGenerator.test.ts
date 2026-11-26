import { describe, expect, it, vi } from "vitest";
import { LogEntryMode, LogEntryRole, type LogEntry } from "@/types/log.type";

vi.mock("@lingui/core/macro", () => ({
  msg: (value: TemplateStringsArray | string) =>
    typeof value === "string" ? value : value.join(""),
}));

vi.mock("@/services/llm", () => ({
  lowerRoleReasoningEffort: vi.fn(),
  resolveModelRole: vi.fn(),
  sendRoleChat: vi.fn(),
}));
import {
  buildRecapMessages,
  parseRecapResponse,
  RecapParseError,
} from "./recapGenerator";

const ids = new Map([
  ["p1", "gm-1"],
  ["p2", "gm-2"],
  ["p3", "gm-3"],
]);

const entry = (
  id: string,
  role: LogEntryRole,
  text: string,
  extra: Partial<LogEntry> = {},
): LogEntry => ({ id, role, mode: LogEntryMode.DO, text, ...extra });

describe("story recap requests", () => {
  it("numbers only the passages to recap and shows the rest as context", () => {
    const { messages, ids } = buildRecapMessages({
      plot: "A heist in the salt city.",
      storySoFar: ["Mara joined the crew."],
      range: [
        {
          entry: entry("p-1", LogEntryRole.PLAYER, "I pick the lock."),
          pending: false,
        },
        {
          entry: entry("gm-1", LogEntryRole.GM, "The lock clicks."),
          pending: true,
        },
        {
          entry: entry("gm-2", LogEntryRole.GM, "Guards pass.", {
            recap: ["Guards passed by."],
          }),
          pending: false,
        },
        {
          entry: entry("p-2", LogEntryRole.PLAYER, "", {
            mode: LogEntryMode.CONTINUE,
          }),
          pending: false,
        },
        { entry: entry("gm-3", LogEntryRole.GM, "Tobin lies."), pending: true },
      ],
    });

    expect([...ids]).toEqual([
      ["p1", "gm-1"],
      ["p2", "gm-3"],
    ]);
    const user = messages[1].content;
    expect(user).toContain("Plot:\nA heist in the salt city.");
    expect(user).toContain("Story so far:\n- Mara joined the crew.");
    expect(user).toContain("[Player]\nAction: I pick the lock.");
    expect(user).toContain("[Narrator p1]\nThe lock clicks.");
    expect(user).toContain("[Narrator, already recorded]\n- Guards passed by.");
    expect(user).toContain("[Narrator p2]\nTobin lies.");
    expect(user).not.toContain("Continue");
    expect(messages[0].content).toContain('{"recaps":[{"id":"p1"');
  });
});

describe("story recap replies", () => {
  it("reads fenced JSON and keeps every passage, empty or not", () => {
    const result = parseRecapResponse(
      'Here you go:\n```json\n{"recaps":[{"id":"p1","lines":["- Mara broke Tobin\'s nose."]},{"id":"p2","lines":[]}]}\n```',
      ids,
    );

    expect(result).toEqual(
      new Map([
        ["gm-1", ["Mara broke Tobin's nose."]],
        ["gm-2", []],
        ["gm-3", []],
      ]),
    );
  });

  it("ignores ids it never asked for and trims long replies", () => {
    const result = parseRecapResponse(
      JSON.stringify({
        recaps: [
          { id: "p1", lines: Array.from({ length: 9 }, (_, i) => `Line ${i}`) },
          { id: "p2", lines: "Tobin lied.\nThe map was fake." },
          { id: "p9", lines: ["Not asked for."] },
        ],
      }),
      ids,
    );

    expect(result.get("gm-1")).toHaveLength(6);
    expect(result.get("gm-2")).toEqual(["Tobin lied.", "The map was fake."]);
    expect([...result.keys()]).toEqual(["gm-1", "gm-2", "gm-3"]);
  });

  it("fails on prose or a reply that skips most passages", () => {
    expect(() => parseRecapResponse("Mara broke Tobin's nose.", ids)).toThrow(
      RecapParseError,
    );
    expect(() =>
      parseRecapResponse('{"recaps":[{"id":"p1","lines":["x"]}]}', ids),
    ).toThrow(RecapParseError);
  });
});

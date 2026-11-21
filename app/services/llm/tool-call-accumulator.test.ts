import { describe, expect, it } from "vitest";
import { ToolCallAccumulator } from "./tool-call-accumulator";

describe("ToolCallAccumulator", () => {
  it("joins interleaved deltas by index and returns calls in index order", () => {
    const accumulator = new ToolCallAccumulator();
    accumulator.add([
      { index: 2, id: "call_b", function: { name: "b", arguments: '{"x"' } },
    ]);
    accumulator.add([
      { index: 0, id: "call_a", function: { name: "a", arguments: "{" } },
    ]);
    accumulator.add([
      { index: 2, function: { arguments: ":1}" } },
      { index: 0, function: { arguments: "}" } },
    ]);
    expect(accumulator.size).toBe(2);
    expect(accumulator.result()).toEqual({
      calls: [
        {
          id: "call_a",
          type: "function",
          function: { name: "a", arguments: "{}" },
        },
        {
          id: "call_b",
          type: "function",
          function: { name: "b", arguments: '{"x":1}' },
        },
      ],
      incomplete: [],
    });
  });

  it("reports calls that never received an id or a name", () => {
    const accumulator = new ToolCallAccumulator();
    accumulator.add([{ index: 0, function: { name: "a", arguments: "{}" } }]);
    accumulator.add([{ index: 1, id: "call_b" }]);
    accumulator.add(undefined);
    expect(accumulator.result()).toEqual({
      calls: [],
      incomplete: [
        { name: "a", arguments: "{}" },
        { id: "call_b", arguments: "" },
      ],
    });
  });
});

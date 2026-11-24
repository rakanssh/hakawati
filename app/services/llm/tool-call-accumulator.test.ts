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

  it("gives a named call without an id a generated one", () => {
    const accumulator = new ToolCallAccumulator();
    accumulator.add([{ index: 0, function: { name: "a", arguments: "{" } }]);
    accumulator.add([{ index: 0, id: "", function: { arguments: "}" } }]);
    accumulator.add([{ index: 1, function: { name: "b", arguments: "{}" } }]);
    const { calls, incomplete } = accumulator.result();
    expect(incomplete).toEqual([]);
    expect(calls.map((call) => call.function)).toEqual([
      { name: "a", arguments: "{}" },
      { name: "b", arguments: "{}" },
    ]);
    expect(calls[0].id).toMatch(/^call_\S+$/);
    expect(calls[1].id).toMatch(/^call_\S+$/);
    expect(calls[0].id).not.toBe(calls[1].id);
    expect(accumulator.result().calls).toEqual(calls);
  });

  it("keeps calls apart when the provider leaves out the index", () => {
    const accumulator = new ToolCallAccumulator();
    accumulator.add([
      {
        function: { name: "modify_stat", arguments: '{"name":"HP",' },
      },
    ]);
    accumulator.add([{ function: { arguments: '"value":-2}' } }]);
    accumulator.add([
      {
        function: { name: "add_to_inventory", arguments: '{"item":"Key"}' },
      },
      { id: "call_c", function: { name: "c", arguments: "{" } },
    ]);
    accumulator.add([{ id: "call_c", function: { arguments: "}" } }]);
    expect(
      accumulator.result().calls.map((call) => call.function.arguments),
    ).toEqual(['{"name":"HP","value":-2}', '{"item":"Key"}', "{}"]);
  });

  it("reports calls that never received a name", () => {
    const accumulator = new ToolCallAccumulator();
    accumulator.add([{ index: 0, function: { name: "a", arguments: "{}" } }]);
    accumulator.add([{ index: 1, id: "call_b" }]);
    accumulator.add(undefined);
    const { calls, incomplete } = accumulator.result();
    expect(calls.map((call) => call.function.name)).toEqual(["a"]);
    expect(incomplete).toEqual([{ id: "call_b", arguments: "" }]);
  });
});

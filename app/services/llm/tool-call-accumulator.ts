import type { ToolCallDelta } from "./schema";
import type { ToolCall } from "./tools";

interface PartialToolCall {
  id?: string;
  name?: string;
  arguments: string;
}

export class ToolCallAccumulator {
  private readonly calls = new Map<number, PartialToolCall>();

  add(deltas: ToolCallDelta[] | undefined): void {
    for (const delta of deltas ?? []) {
      const call = this.calls.get(delta.index) ?? { arguments: "" };
      if (delta.id) call.id = delta.id;
      if (delta.function?.name) call.name = delta.function.name;
      if (delta.function?.arguments) call.arguments += delta.function.arguments;
      this.calls.set(delta.index, call);
    }
  }

  get size(): number {
    return this.calls.size;
  }

  result(): { calls: ToolCall[]; incomplete: PartialToolCall[] } {
    const calls: ToolCall[] = [];
    const incomplete: PartialToolCall[] = [];
    for (const [, call] of [...this.calls.entries()].sort(
      ([a], [b]) => a - b,
    )) {
      if (call.id && call.name) {
        calls.push({
          id: call.id,
          type: "function",
          function: { name: call.name, arguments: call.arguments },
        });
      } else {
        incomplete.push(call);
      }
    }
    return { calls, incomplete };
  }
}

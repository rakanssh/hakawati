import { nanoid } from "nanoid";
import type { ToolCallDelta } from "./schema";
import type { ToolCall } from "./tools";

interface PartialToolCall {
  id?: string;
  name?: string;
  arguments: string;
}

export class ToolCallAccumulator {
  private readonly calls = new Map<number, PartialToolCall>();
  private latest: number | undefined;

  add(deltas: ToolCallDelta[] | undefined): void {
    for (const delta of deltas ?? []) {
      const index = this.indexOf(delta);
      const call = this.calls.get(index) ?? { arguments: "" };
      if (delta.id) call.id = delta.id;
      if (delta.function?.name) call.name = delta.function.name;
      if (delta.function?.arguments) call.arguments += delta.function.arguments;
      this.calls.set(index, call);
      this.latest = index;
    }
  }

  // Gemini's OpenAI-compatible API sends each call whole, without an index.
  private indexOf(delta: ToolCallDelta): number {
    if (typeof delta.index === "number") return delta.index;
    if (delta.id) {
      for (const [index, call] of this.calls)
        if (call.id === delta.id) return index;
    } else if (!delta.function?.name && this.latest !== undefined) {
      return this.latest;
    }
    return Math.max(-1, ...this.calls.keys()) + 1;
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
      if (call.name) {
        call.id ??= `call_${nanoid()}`;
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

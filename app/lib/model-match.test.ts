import { describe, expect, it } from "vitest";
import type { LLMModel } from "@/types/model.type";
import { matchModels } from "./model-match";

const models: LLMModel[] = [
  { id: "anthropic/claude-sonnet-4.5", name: "Claude Sonnet 4.5" },
  { id: "anthropic/claude-opus-4.1", name: "Claude Opus 4.1" },
  { id: "openai/gpt-5", name: "GPT-5" },
  { id: "openai/gpt-5-mini", name: "GPT-5 Mini" },
];
const ids = (query: string) => matchModels(models, query).map((m) => m.id);

describe("matchModels", () => {
  it("prefers an exact id, then an exact name, then the id after its provider", () => {
    expect(ids("openai/gpt-5")).toEqual(["openai/gpt-5"]);
    expect(ids("gpt-5 mini")).toEqual(["openai/gpt-5-mini"]);
    expect(ids("gpt-5")).toEqual(["openai/gpt-5"]);
  });

  it("falls back to every word appearing in the id or name", () => {
    expect(ids("sonnet")).toEqual(["anthropic/claude-sonnet-4.5"]);
    expect(ids("claude")).toEqual([
      "anthropic/claude-sonnet-4.5",
      "anthropic/claude-opus-4.1",
    ]);
    expect(ids("llama")).toEqual([]);
    expect(ids("  ")).toEqual([]);
  });
});

import { describe, expect, it } from "vitest";
import {
  getModelReasoning,
  knownOpenAiReasoning,
  normalizeReasoningEffort,
  readReasoningCapabilities,
  reasoningProvider,
  REASONING_EFFORTS,
} from "./reasoning";

describe("reasoning capability discovery", () => {
  it("detects providers by exact URL hostname, with an explicit subscription route", () => {
    expect(reasoningProvider("https://openrouter.ai/api/v1")).toBe(
      "openrouter",
    );
    expect(reasoningProvider("https://api.openai.com/v1/")).toBe("openai");
    expect(reasoningProvider("https://api.openai.com.evil.test/v1")).toBe(
      "generic",
    );
    expect(reasoningProvider("http://localhost:11434/v1")).toBe("generic");
    expect(reasoningProvider("", true)).toBe("chatgpt");
  });

  it("uses OpenRouter's published list, ignoring unsupported values and duplicates", () => {
    expect(
      readReasoningCapabilities(
        {
          reasoning: {
            supported_efforts: ["high", "none", "low", "ultra", "low"],
            default_effort: "low",
            mandatory: true,
          },
        },
        "openrouter",
      ),
    ).toEqual({
      supportedEfforts: ["low", "high"],
      defaultEffort: "low",
      mandatory: true,
    });
  });

  it("distinguishes null, omitted, empty and unknown OpenRouter effort metadata", () => {
    expect(
      readReasoningCapabilities(
        { reasoning: { supported_efforts: null } },
        "openrouter",
      )?.supportedEfforts,
    ).toEqual(REASONING_EFFORTS);
    expect(
      readReasoningCapabilities({ reasoning: { enabled: true } }, "openrouter"),
    ).toEqual({ supportedEfforts: [] });
    expect(
      readReasoningCapabilities(
        { reasoning: { supported_efforts: [] } },
        "openrouter",
      ),
    ).toEqual({ supportedEfforts: [] });
    expect(
      readReasoningCapabilities(
        { supported_parameters: ["reasoning"] },
        "openrouter",
      ),
    ).toBeUndefined();
    expect(
      readReasoningCapabilities(
        { supported_parameters: ["tools"] },
        "openrouter",
      ),
    ).toEqual({ supportedEfforts: [] });
    expect(readReasoningCapabilities({}, "openrouter")).toBeUndefined();
  });

  it("only interprets null as all levels on OpenRouter", () => {
    expect(
      readReasoningCapabilities(
        { reasoning: { supported_efforts: null } },
        "generic",
      ),
    ).toEqual({ supportedEfforts: [] });
  });

  it("honors account capability metadata before an OpenAI model fallback", () => {
    expect(
      readReasoningCapabilities(
        {
          slug: "gpt-5.5",
          supported_reasoning_levels: [
            { effort: "low", description: "Fast" },
            { effort: "high", description: "Thorough" },
            { effort: "ultra", description: "Different mode" },
          ],
          default_reasoning_level: "high",
        },
        "chatgpt",
      ),
    ).toEqual({ supportedEfforts: ["low", "high"], defaultEffort: "high" });
    expect(
      readReasoningCapabilities(
        { slug: "gpt-5.5", supported_reasoning_levels: [] },
        "chatgpt",
      ),
    ).toEqual({ supportedEfforts: [] });
    expect(
      readReasoningCapabilities(
        { slug: "gpt-5.5", supported_parameters: ["tools"] },
        "chatgpt",
      ),
    ).toEqual({ supportedEfforts: [] });
  });

  it("allows custom providers only when they advertise concrete effort values", () => {
    expect(
      readReasoningCapabilities({ id: "gpt-5.5" }, "generic"),
    ).toBeUndefined();
    expect(
      readReasoningCapabilities(
        { id: "custom", supported_reasoning_efforts: ["low", "high"] },
        "generic",
      ),
    ).toEqual({ supportedEfforts: ["low", "high"] });
    expect(
      readReasoningCapabilities(
        { supported_parameters: ["reasoning_effort"] },
        "generic",
      ),
    ).toBeUndefined();
  });

  it("keeps API fallback conservative and specific to model families and snapshots", () => {
    expect(knownOpenAiReasoning("gpt-5-2025-08-07")?.supportedEfforts).toEqual([
      "minimal",
      "low",
      "medium",
      "high",
    ]);
    expect(knownOpenAiReasoning("gpt-5.1")?.supportedEfforts).toEqual([
      "none",
      "low",
      "medium",
      "high",
    ]);
    expect(knownOpenAiReasoning("gpt-5.5")?.supportedEfforts).toContain(
      "xhigh",
    );
    expect(knownOpenAiReasoning("gpt-6.1-sol")?.supportedEfforts).not.toContain(
      "none",
    );
    expect(knownOpenAiReasoning("gpt-6-sol")?.supportedEfforts).toContain(
      "max",
    );
    expect(knownOpenAiReasoning("gpt-5.99")).toBeUndefined();
    expect(knownOpenAiReasoning("gpt-5.5-chat-latest")).toBeUndefined();
  });

  it("does not override explicit normalized metadata or invent support on another provider", () => {
    const model = { id: "gpt-5.5", name: "GPT" };
    expect(getModelReasoning(model, "chatgpt")?.supportedEfforts).toContain(
      "high",
    );
    expect(getModelReasoning(model, "generic")).toBeUndefined();
    expect(
      getModelReasoning(
        { ...model, reasoning: { supportedEfforts: [] } },
        "openai",
      ),
    ).toEqual({ supportedEfforts: [] });
    expect(getModelReasoning(undefined, "openai")).toBeUndefined();
  });

  it("validates saved values without substituting a different explicit level", () => {
    const reasoning = { supportedEfforts: ["low", "high"] as const };
    const capabilities = { supportedEfforts: [...reasoning.supportedEfforts] };
    expect(normalizeReasoningEffort("low", capabilities)).toBe("low");
    expect(normalizeReasoningEffort("xhigh", capabilities)).toBeUndefined();
    expect(normalizeReasoningEffort(undefined, capabilities)).toBeUndefined();
    expect(normalizeReasoningEffort("high", undefined)).toBeUndefined();
    expect(
      normalizeReasoningEffort("none", {
        supportedEfforts: ["none"],
        mandatory: true,
      }),
    ).toBeUndefined();
  });
});

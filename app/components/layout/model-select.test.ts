import { describe, expect, it } from "vitest";
import { getModelMetaLabels } from "./model-select-meta";
import type { LLMModel } from "@/services/llm/schema";

describe("getModelMetaLabels", () => {
  it("does not render duration-priced speech models as per-million token prices", () => {
    const model: LLMModel = {
      id: "microsoft/mai-transcribe-1.5",
      name: "Microsoft: MAI-Transcribe 1.5",
      contextLength: 0,
      pricing: {
        prompt: 0.36,
        completion: 0,
        request: 0,
        image: 0,
        audio: 0,
      },
    };

    expect(getModelMetaLabels(model, "speechToText")).toEqual(["Audio $0.36"]);
  });

  it("keeps token-priced transcription models as per-million token prices", () => {
    const model: LLMModel = {
      id: "openai/gpt-4o-transcribe",
      name: "OpenAI: GPT-4o Transcribe",
      contextLength: 128000,
      pricing: {
        prompt: 0.0000025,
        completion: 0.00001,
        request: 0,
        image: 0,
        audio: 0,
      },
    };

    expect(getModelMetaLabels(model, "speechToText")).toEqual([
      "128,000 tk",
      "In $2.50/M",
      "Out $10.00/M",
    ]);
  });
});

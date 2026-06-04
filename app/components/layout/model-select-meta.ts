import type { LLMModel } from "@/services/llm/schema";
import type { ModelRole } from "@/types";

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const n = typeof value === "string" ? parseFloat(value) : (value as number);
  return Number.isFinite(n) ? (n as number) : undefined;
}

function formatUSD(value?: number, opts?: Intl.NumberFormatOptions) {
  if (value === undefined) return "—";
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 6,
    ...opts,
  }).format(value);
}

function formatPerMillionUSDFromPerToken(value: unknown) {
  const v = toNumber(value);
  return formatUSD(v !== undefined ? v * 1000000 : undefined, {
    maximumFractionDigits: 3,
  });
}

function isLikelyAudioUnitPriced(role: ModelRole, model: LLMModel) {
  if (role !== "speechToText" && role !== "textToSpeech") {
    return false;
  }

  const prompt = toNumber(model.pricing?.prompt);
  const completion = toNumber(model.pricing?.completion);

  return (
    prompt !== undefined &&
    prompt > 0 &&
    (model.contextLength === undefined || model.contextLength <= 0) &&
    (completion === undefined || completion === 0)
  );
}

export function getModelMetaLabels(m: LLMModel, role: ModelRole): string[] {
  const meta: string[] = [];
  if (m.contextLength !== undefined && m.contextLength > 0) {
    meta.push(`${m.contextLength.toLocaleString()} tk`);
  }

  if (isLikelyAudioUnitPriced(role, m)) {
    meta.push(
      `Audio ${formatUSD(toNumber(m.pricing?.prompt), {
        maximumFractionDigits: 6,
      })}`,
    );
    return meta;
  }

  if (m.pricing?.prompt !== undefined) {
    meta.push(`In ${formatPerMillionUSDFromPerToken(m.pricing.prompt)}/M`);
  }
  if (m.pricing?.completion !== undefined) {
    meta.push(`Out ${formatPerMillionUSDFromPerToken(m.pricing.completion)}/M`);
  }
  return meta;
}

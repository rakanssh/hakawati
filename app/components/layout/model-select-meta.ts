import type { LLMModel } from "@/services/llm/schema";
import type { ModelRole } from "@/types";

function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  const n = typeof value === "string" ? parseFloat(value) : (value as number);
  return Number.isFinite(n) ? (n as number) : undefined;
}

function toNonNegativeNumber(value: unknown): number | undefined {
  const n = toNumber(value);
  return n !== undefined && n >= 0 ? n : undefined;
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
  const v = toNonNegativeNumber(value);
  return formatUSD(v !== undefined ? v * 1000000 : undefined, {
    maximumFractionDigits: 3,
  });
}

function isLikelyAudioUnitPriced(role: ModelRole, model: LLMModel) {
  if (role !== "speechToText" && role !== "textToSpeech") {
    return false;
  }

  const prompt = toNonNegativeNumber(model.pricing?.prompt);
  const completion = toNonNegativeNumber(model.pricing?.completion);

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
      `Audio ${formatUSD(toNonNegativeNumber(m.pricing?.prompt), {
        maximumFractionDigits: 6,
      })}`,
    );
    return meta;
  }

  const prompt = toNonNegativeNumber(m.pricing?.prompt);
  const completion = toNonNegativeNumber(m.pricing?.completion);

  if (prompt !== undefined) {
    meta.push(`In ${formatPerMillionUSDFromPerToken(prompt)}/M`);
  }
  if (completion !== undefined) {
    meta.push(`Out ${formatPerMillionUSDFromPerToken(completion)}/M`);
  }
  return meta;
}

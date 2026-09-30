import type {
  LLMModel,
  ReasoningCapabilities,
  ReasoningEffort,
} from "./schema";

export type ReasoningProvider = "openrouter" | "openai" | "chatgpt" | "generic";

export const REASONING_EFFORTS: readonly ReasoningEffort[] = [
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
];

function isEffort(value: unknown): value is ReasoningEffort {
  return REASONING_EFFORTS.includes(value as ReasoningEffort);
}

export function reasoningProvider(
  baseUrl: string,
  isChatGpt = false,
): ReasoningProvider {
  if (isChatGpt) return "chatgpt";
  try {
    const url = new URL(baseUrl);
    if (url.hostname === "openrouter.ai") return "openrouter";
    if (url.hostname === "api.openai.com") return "openai";
  } catch {
    // Unconfigured and local providers do not inherit OpenAI capabilities.
  }
  return "generic";
}

/** Conservative fallback for documented IDs, never arbitrary GPT-like names.
 * Sources: https://developers.openai.com/api/docs/models/<model-id>
 * Account/provider metadata always takes precedence over this table.
 */
export function knownOpenAiReasoning(
  id: string,
): ReasoningCapabilities | undefined {
  const model = id.replace(/-\d{4}-\d{2}-\d{2}$/, "");
  let supportedEfforts: ReasoningEffort[];
  let defaultEffort: ReasoningEffort | undefined;
  switch (model) {
    case "o3":
    case "o4-mini":
      supportedEfforts = ["low", "medium", "high"];
      break;
    case "gpt-5":
    case "gpt-5-mini":
    case "gpt-5-nano":
      supportedEfforts = ["minimal", "low", "medium", "high"];
      defaultEffort = "medium";
      break;
    case "gpt-5.1":
      supportedEfforts = ["none", "low", "medium", "high"];
      defaultEffort = "none";
      break;
    case "gpt-5.2":
      supportedEfforts = ["none", "low", "medium", "high", "xhigh"];
      defaultEffort = "none";
      break;
    case "gpt-5-pro":
      supportedEfforts = ["high"];
      defaultEffort = "high";
      break;
    case "gpt-5.2-pro":
    case "gpt-5.4-pro":
    case "gpt-5.5-pro":
      supportedEfforts = ["medium", "high", "xhigh"];
      defaultEffort =
        model === "gpt-5.4-pro"
          ? "medium"
          : model === "gpt-5.5-pro"
            ? "high"
            : undefined;
      break;
    case "gpt-5.4":
    case "gpt-5.5":
      supportedEfforts = ["none", "low", "medium", "high", "xhigh"];
      defaultEffort = model === "gpt-5.5" ? "medium" : "none";
      break;
    case "gpt-5.3-codex":
      supportedEfforts = ["low", "medium", "high", "xhigh"];
      break;
    case "gpt-5.6":
    case "gpt-5.6-sol":
    case "gpt-5.6-terra":
    case "gpt-5.6-luna":
    case "gpt-6-sol":
    case "gpt-6-luna":
      supportedEfforts = ["none", "low", "medium", "high", "xhigh", "max"];
      defaultEffort = "medium";
      break;
    case "gpt-6-astra":
    case "gpt-6.1-sol":
      supportedEfforts = ["low", "medium", "high", "xhigh", "max"];
      defaultEffort = model === "gpt-6.1-sol" ? "medium" : undefined;
      break;
    default:
      return undefined;
  }
  return {
    supportedEfforts,
    ...(defaultEffort ? { defaultEffort } : {}),
    mandatory: !supportedEfforts.includes("none"),
  };
}

function capabilities(
  values: unknown,
  defaultValue: unknown,
  mandatory: unknown,
): ReasoningCapabilities {
  const offered = Array.isArray(values)
    ? values.map((value: unknown) =>
        value && typeof value === "object"
          ? (value as Record<string, unknown>).effort
          : value,
      )
    : [];
  const supportedEfforts = REASONING_EFFORTS.filter(
    (effort) =>
      offered.includes(effort) && !(mandatory === true && effort === "none"),
  );
  return {
    supportedEfforts,
    ...(isEffort(defaultValue) && supportedEfforts.includes(defaultValue)
      ? { defaultEffort: defaultValue }
      : {}),
    ...(typeof mandatory === "boolean" ? { mandatory } : {}),
  };
}

/** Read published effort values; a parameter name alone doesn't establish levels. */
export function readReasoningCapabilities(
  model: Record<string, unknown>,
  provider: ReasoningProvider,
): ReasoningCapabilities | undefined {
  const raw = model.reasoning;
  if (raw === false) return { supportedEfforts: [] };
  if (raw && typeof raw === "object") {
    const reasoning = raw as Record<string, unknown>;
    if (Object.hasOwn(reasoning, "supported_efforts")) {
      // OpenRouter explicitly defines null as accepting all gateway effort values.
      const efforts =
        reasoning.supported_efforts === null && provider === "openrouter"
          ? REASONING_EFFORTS
          : reasoning.supported_efforts;
      return capabilities(
        efforts,
        reasoning.default_effort,
        reasoning.mandatory,
      );
    }
    if (Object.hasOwn(reasoning, "supportedEfforts")) {
      return capabilities(
        reasoning.supportedEfforts,
        reasoning.defaultEffort,
        reasoning.mandatory,
      );
    }
    if (provider === "openrouter") return { supportedEfforts: [] };
  }
  for (const key of [
    "supported_reasoning_levels",
    "supported_reasoning_efforts",
  ]) {
    if (Object.hasOwn(model, key)) {
      return capabilities(
        model[key],
        model.default_reasoning_level ?? model.default_reasoning_effort,
        model.reasoning_required,
      );
    }
  }
  if (
    Array.isArray(model.supported_parameters) &&
    !model.supported_parameters.some(
      (value) => value === "reasoning" || value === "reasoning_effort",
    )
  ) {
    return { supportedEfforts: [] };
  }
  if (provider === "openai" || provider === "chatgpt") {
    const id = model.slug ?? model.id;
    if (typeof id === "string") return knownOpenAiReasoning(id);
  }
  return undefined;
}

export function getModelReasoning(
  model: LLMModel | undefined,
  provider: ReasoningProvider,
): ReasoningCapabilities | undefined {
  if (!model) return undefined;
  if (model.reasoning !== undefined) {
    return capabilities(
      model.reasoning.supportedEfforts,
      model.reasoning.defaultEffort,
      model.reasoning.mandatory,
    );
  }
  return provider === "openai" || provider === "chatgpt"
    ? knownOpenAiReasoning(model.id)
    : undefined;
}

export function normalizeReasoningEffort(
  effort: unknown,
  reasoning: ReasoningCapabilities | undefined,
): ReasoningEffort | undefined {
  return isEffort(effort) &&
    reasoning?.supportedEfforts.includes(effort) &&
    !(reasoning.mandatory && effort === "none")
    ? effort
    : undefined;
}

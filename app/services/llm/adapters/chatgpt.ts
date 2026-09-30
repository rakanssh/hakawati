import { fetchChatGpt } from "@/services/chatgpt";
import { ResponseMode } from "@/types/api.type";
import type { ChatRequest, ChatResponse, LLMClient, LLMModel } from "../schema";
import { GM_TOOLS } from "../tools";

import { assertNotAborted, responseChunks } from "./responses";
import { readReasoningCapabilities } from "../reasoning";

type JsonObject = Record<string, unknown>;

function object(value: unknown): JsonObject {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonObject)
    : {};
}

function string(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Keeps provider diagnostics available without logging requests or response bodies. */
export class ChatGptInferenceError extends Error {
  readonly code?: string;
  readonly param?: string;
  constructor(
    fallback: string,
    readonly details: unknown,
    readonly status?: number,
    readonly requestId?: string,
  ) {
    const body = object(details);
    const error = object(body.error ?? body);
    const code = string(error.code);
    const recovery: Record<string, string> = {
      subscription_sharing_usage_limit_exceeded:
        "ChatGPT plan usage limit reached. Review your app usage in ChatGPT Settings → Usage, or choose another provider in Settings.",
      subscription_sharing_user_not_eligible:
        "ChatGPT plan usage is unavailable for this account or workspace. Choose another provider in Settings.",
      subscription_sharing_usage_unavailable:
        "ChatGPT usage is temporarily unavailable. Try again later; your connection is saved.",
      subscription_sharing_user_unavailable:
        "ChatGPT account information is temporarily unavailable. Try again later; your connection is saved.",
      subscription_sharing_unsupported_capability:
        "This ChatGPT model or request capability is not supported. Choose another model or adjust the request.",
      subscription_sharing_route_not_supported:
        "ChatGPT rejected the inference endpoint. Check the provider configuration.",
      subscription_sharing_invalid_user:
        "ChatGPT could not validate this account. Check the selected account and reconnect if necessary.",
      chatpass_v2_scope_not_authorized:
        "ChatGPT plan usage is not authorized. Enable it from the ChatGPT connection in Settings.",
      chatpass_v2_invalid_authorization_context:
        "ChatGPT plan usage authorization was rejected. Reconnect the ChatGPT account in Settings.",
    };
    const diagnostic = string(error.message) ?? string(body.detail);
    const message = (code && recovery[code]) || diagnostic || fallback;
    super(
      `${message}${code ? ` (${code})` : ""}${requestId ? ` [request ${requestId}]` : ""}`,
    );
    this.name = "ChatGptInferenceError";
    // Callers may log Error objects. Keep the original diagnostics available for
    // inspection without enumerating response bodies into those logs.
    Object.defineProperty(this, "details", { enumerable: false });
    this.code = code;
    this.param = string(error.param);
  }
}

async function assertOk(response: Response): Promise<void> {
  if (response.ok) return;
  const text = await response.text();
  let details: unknown;
  try {
    details = JSON.parse(text);
  } catch {
    details = { detail: text };
  }
  throw new ChatGptInferenceError(
    `ChatGPT request failed (${response.status}). Check the selected account and plan usage permission.`,
    details,
    response.status,
    response.headers.get("x-request-id") ?? undefined,
  );
}

/** A separate adapter keeps ChatGPT plan billing distinct from API-key providers. */
export function ChatGptClient(): LLMClient {
  async function chat(
    req: ChatRequest,
    signal?: AbortSignal,
  ): Promise<ChatResponse> {
    assertNotAborted(signal);
    const body: JsonObject = {
      model: req.model,
      input: req.messages.map((message) => ({
        role: message.role === "system" ? "developer" : message.role,
        content: message.content,
      })),
      store: false,
      stream: true,
    };
    if (req.reasoningEffort !== undefined)
      body.reasoning = { effort: req.reasoningEffort };
    if (req.responseMode !== ResponseMode.FREE_FORM) {
      body.tools = [
        {
          type: "namespace",
          name: "hakawati",
          description:
            "Update player stats and inventory in the current adventure.",
          tools: GM_TOOLS.map((tool) => ({
            type: tool.type,
            ...tool.function,
          })),
        },
      ];
      body.tool_choice = "auto";
    }
    // This route rejects sampling/output limits; never spread generic options here.
    const response = await fetchChatGpt("/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    await assertOk(response);
    const result: ChatResponse = {
      content: "",
      raw: undefined,
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
    const iterator = responseChunks(response, result, signal, {
      provider: "ChatGPT",
      namespace: "hakawati",
      incompleteMessage:
        "ChatGPT did not complete the response. Lower the thinking level, try a shorter request, or choose another model.",
      error: (message, details) =>
        new ChatGptInferenceError(
          message,
          details,
          response.status,
          response.headers.get("x-request-id") ?? undefined,
        ),
    });
    if (req.stream) {
      result.iterator = iterator;
    } else {
      for await (const chunk of iterator) {
        result.content += chunk.content ?? "";
        if (chunk.thinking)
          result.thinking = (result.thinking ?? "") + chunk.thinking;
      }
    }
    return result;
  }

  async function models(signal?: AbortSignal): Promise<LLMModel[]> {
    assertNotAborted(signal);
    const response = await fetchChatGpt("/models", { method: "GET", signal });
    await assertOk(response);
    const catalog = object(await response.json());
    assertNotAborted(signal);
    if (!Array.isArray(catalog.models))
      throw new ChatGptInferenceError(
        "ChatGPT returned an invalid model catalog. Reconnect or try again later.",
        { code: "invalid_model_catalog" },
      );
    return catalog.models.flatMap((value): LLMModel[] => {
      const model = object(value);
      if (
        model.visibility !== "list" ||
        typeof model.slug !== "string" ||
        !model.slug.trim()
      )
        return [];
      const context = model.context_length ?? model.context_window;
      const parameters = Array.isArray(model.supported_parameters)
        ? model.supported_parameters
        : undefined;
      const reasoning = readReasoningCapabilities(model, "chatgpt");
      const maxOutputTokens = model.max_output_tokens;
      return [
        {
          id: model.slug,
          ...(reasoning ? { reasoning } : {}),
          ...(typeof maxOutputTokens === "number" && maxOutputTokens > 0
            ? { maxOutputTokens }
            : {}),
          name: string(model.display_name) || model.slug,
          ...(typeof context === "number" && context > 0
            ? { contextLength: context }
            : {}),
          ...(typeof model.supports_tool_calls === "boolean"
            ? { supportsToolCalls: model.supports_tool_calls }
            : parameters
              ? {
                  supportsToolCalls:
                    parameters.includes("tools") ||
                    parameters.includes("tool_choice"),
                }
              : {}),
        },
      ];
    });
  }

  async function unsupportedAudio(): Promise<never> {
    throw new Error(
      "ChatGPT plan usage does not support speech input or output. Select another provider for audio in Settings.",
    );
  }
  return {
    chat,
    models,
    transcribeAudio: unsupportedAudio,
    synthesizeSpeech: unsupportedAudio,
  };
}

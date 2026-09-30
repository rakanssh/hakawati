import { ResponseMode } from "@/types/api.type";
import {
  AudioTranscriptionRequest,
  AudioTranscriptionResponse,
  AudioSpeechRequest,
  AudioSpeechResponse,
  LLMClient,
  ChatRequest,
  ChatResponse,
  LLMModel,
} from "../schema";
import { parseOpenAIStream } from "../streaming";
import {
  knownOpenAiReasoning,
  readReasoningCapabilities,
  reasoningProvider,
} from "../reasoning";
import {
  assertNotAborted,
  readResponseJson,
  responseChunks,
  type ResponsesOptions,
} from "./responses";
import { fetch } from "@tauri-apps/plugin-http";
import { GM_TOOLS, ToolCall } from "../tools";
import { ModelRole } from "@/types";
import { repairCommonMojibake } from "@/lib/utils";

const samplingParameterNames: Record<string, string> = {
  temperature: "temperature",
  topP: "top_p",
  topK: "top_k",
  frequencyPenalty: "frequency_penalty",
  presencePenalty: "presence_penalty",
  repetitionPenalty: "repetition_penalty",
  minP: "min_p",
  topA: "top_a",
  seed: "seed",
};

export interface OpenAiConnection {
  baseUrl: string;
  apiKey?: string;
  role?: ModelRole;
  model?: LLMModel;
}

export function OpenAiClient(connection: OpenAiConnection): LLMClient {
  const base = connection.baseUrl.replace(/\/$/, "");
  const apiKey = connection.apiKey?.trim();
  const provider = reasoningProvider(base);
  const isOpenRouter = provider === "openrouter";

  async function chat(
    req: ChatRequest,
    signal?: AbortSignal,
  ): Promise<ChatResponse> {
    assertNotAborted(signal);
    const selectedModel =
      connection.model?.id === req.model ? connection.model : undefined;
    const reasoning = selectedModel?.reasoning;
    const knownReasoning = knownOpenAiReasoning(req.model);
    if (
      provider === "openai" &&
      (req.reasoningEffort !== undefined ||
        reasoning?.supportedEfforts.length ||
        knownReasoning?.supportedEfforts.length)
    ) {
      return chatResponses(req, signal);
    }
    const useToolCalling = req.responseMode !== ResponseMode.FREE_FORM;

    const options = Object.entries(req.options ?? {}).filter(
      ([, value]) => value !== undefined && value !== null,
    );
    const samplingOptions =
      isOpenRouter && req.reasoningEffort !== undefined
        ? Object.fromEntries(
            options
              .map(
                ([key, value]) => [samplingParameterNames[key], value] as const,
              )
              .filter(
                ([key]) =>
                  key && selectedModel?.supportedParameters?.includes(key),
              ),
          )
        : Object.fromEntries(options);

    const body: Record<string, unknown> = {
      model: req.model,
      messages: req.messages,
      stream: req.stream,
      max_tokens: req.max_tokens,
      ...samplingOptions,
    };

    if (req.reasoningEffort !== undefined) {
      if (isOpenRouter) {
        body.reasoning = { effort: req.reasoningEffort };
        // Only advertised sampler fields accompany strict routing: application
        // defaults such as seed can otherwise exclude every reasoning endpoint.
        // Without catalog metadata, keep provider sampler defaults.
        body.provider = { require_parameters: true };
      } else {
        body.reasoning_effort = req.reasoningEffort;
      }
    }

    if (useToolCalling) {
      body.tools = GM_TOOLS;
      body.tool_choice = "auto";
    }

    console.debug(`Sending request to ${req.model}:`, body);
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/rakanssh/hakawati",
      "X-Title": "Hakawati",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    };

    const doFetch = () =>
      fetch(`${base}/chat/completions`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal,
      }).then(async (r) => {
        if (!r.ok) throw new Error(await r.text());
        if (req.stream) {
          return {
            content: "",
            iterator: parseOpenAIStream(r.body!, {
              outputLimitAdjustable: connection.role !== "utility",
            }),
            raw: r,
            usage: {
              prompt_tokens: 0,
              completion_tokens: 0,
              total_tokens: 0,
            },
          };
        } else {
          const json = await r.json();
          if (json.choices?.[0]?.finish_reason === "length") {
            throw new Error(
              connection.role === "utility"
                ? "The response reached the output token limit. Lower the Utility thinking level or try a shorter request."
                : "The response reached the output token limit. Increase Max Output Tokens or lower the thinking level and retry.",
            );
          }
          const message = json.choices[0].message;
          const thinking =
            (typeof message.reasoning === "string" && message.reasoning) ||
            (typeof message.reasoning_content === "string" &&
              message.reasoning_content) ||
            (typeof message.thinking === "string" && message.thinking) ||
            "";
          const response: ChatResponse = {
            content: repairCommonMojibake(message.content || ""),
            ...(thinking ? { thinking: repairCommonMojibake(thinking) } : {}),
            raw: json,
            usage: json.usage,
          };

          if (message.tool_calls && Array.isArray(message.tool_calls)) {
            response.tool_calls = message.tool_calls.map((tc: ToolCall) => ({
              id: tc.id,
              type: tc.type,
              function: {
                name: tc.function.name,
                arguments: tc.function.arguments,
              },
            }));
          }

          return response;
        }
      });

    return doFetch();
  }

  async function chatResponses(
    req: ChatRequest,
    signal?: AbortSignal,
  ): Promise<ChatResponse> {
    const knownReasoning = knownOpenAiReasoning(req.model);
    const reasoning =
      connection.model?.id === req.model
        ? (connection.model.reasoning ?? knownReasoning)
        : knownReasoning;
    const effectiveEffort = req.reasoningEffort ?? reasoning?.defaultEffort;
    // The documented OpenAI models with None support also accept temperature
    // and top_p in that mode. Unknown models' reasoning metadata alone does
    // not establish sampler compatibility; seeds and penalties stay omitted.
    const supportsSampling =
      effectiveEffort === "none" &&
      knownReasoning?.supportedEfforts.includes("none");
    const body: Record<string, unknown> = {
      model: req.model,
      input: req.messages.map((message) => ({
        role: message.role === "system" ? "developer" : message.role,
        content: message.content,
      })),
      store: false,
      stream: Boolean(req.stream),
      ...(req.max_tokens !== undefined
        ? { max_output_tokens: req.max_tokens }
        : {}),
      ...(req.reasoningEffort !== undefined
        ? { reasoning: { effort: req.reasoningEffort } }
        : {}),
    };
    if (supportsSampling) {
      if (typeof req.options?.temperature === "number")
        body.temperature = req.options.temperature;
      if (typeof req.options?.topP === "number") body.top_p = req.options.topP;
    }
    if (req.responseMode !== ResponseMode.FREE_FORM) {
      body.tools = GM_TOOLS.map((tool) => ({
        type: tool.type,
        ...tool.function,
      }));
      body.tool_choice = "auto";
    }
    const response = await fetch(`${base}/responses`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify(body),
      signal,
    });
    assertNotAborted(signal);
    if (!response.ok) {
      throw new Error(
        await readErrorMessage(response, "OpenAI request failed"),
      );
    }
    const result: ChatResponse = {
      content: "",
      raw: undefined,
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    };
    const options: ResponsesOptions = {
      provider: "OpenAI",
      ...(connection.role === "utility"
        ? {
            incompleteMessage:
              "OpenAI did not complete the response. Lower the Utility thinking level or try a shorter request.",
          }
        : {}),
      error: (message, details) => {
        const diagnostic = extractErrorMessage(details);
        const requestId = response.headers.get("x-request-id");
        return new Error(
          `${diagnostic || message}${requestId ? ` [request ${requestId}]` : ""}`,
        );
      },
    };
    if (req.stream)
      result.iterator = responseChunks(response, result, signal, options);
    else {
      const json: unknown = await response.json();
      await readResponseJson(json, result, signal, options);
      result.raw = json;
    }
    return result;
  }

  async function models(signal?: AbortSignal): Promise<LLMModel[]> {
    const modelPath =
      isOpenRouter && connection.role === "speechToText"
        ? "/models?output_modalities=transcription"
        : isOpenRouter && connection.role === "textToSpeech"
          ? "/models?output_modalities=speech"
          : "/models";
    console.debug(`Fetching models from ${base}${modelPath}`);
    const headers: HeadersInit = {
      "HTTP-Referer": "https://github.com/rakanssh/hakawati",
      "X-Title": "Hakawati",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    };
    const r = await fetch(`${base}${modelPath}`, {
      method: "GET",
      headers,
      signal,
    });
    if (!r.ok) {
      const errorText = await r.text().catch(() => "");
      console.error(`Models fetch failed (${r.status}):`, errorText);
      console.error("Request URL:", `${base}${modelPath}`);
      throw new Error(errorText || `Failed to fetch models (${r.status})`);
    }
    const json = await r.json();
    // Allow providers that return minimal model info
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any[] = Array.isArray(json?.data)
      ? json.data
      : Array.isArray(json?.models)
        ? json.models
        : Array.isArray(json)
          ? json
          : [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return data.map((model: any) => {
      const supportedParameters = Array.isArray(model.supported_parameters)
        ? (model.supported_parameters as string[])
        : undefined;

      const supportsToolCalls = supportedParameters
        ? supportedParameters.some((param) =>
            ["tools", "tool_choice", "tool_calls", "function_call"].includes(
              param,
            ),
          )
        : undefined;
      const supportedVoices = readSupportedVoices(model);
      const reasoning = readReasoningCapabilities(model, provider);
      const maxOutputTokens =
        model.top_provider?.max_completion_tokens ??
        model.max_output_tokens ??
        model.max_completion_tokens;

      return {
        id: model.id ?? model.name,
        name: model.name ?? model.id ?? "unknown",
        contextLength: model.context_length ?? model.contextLength,
        pricing: model.pricing,
        supportsResponseFormat:
          supportedParameters?.includes("response_format"),
        supportsToolCalls,
        supportedVoices,
        ...(supportedParameters ? { supportedParameters } : {}),
        ...(reasoning ? { reasoning } : {}),
        ...(typeof maxOutputTokens === "number" && maxOutputTokens > 0
          ? { maxOutputTokens }
          : {}),
      } satisfies LLMModel;
    });
  }

  async function transcribeAudio(
    req: AudioTranscriptionRequest,
    signal?: AbortSignal,
  ): Promise<AudioTranscriptionResponse> {
    if (isOpenRouter) {
      return transcribeOpenRouterAudio(req, signal);
    }

    const form = new FormData();
    form.append("file", req.file, req.filename ?? "speech.webm");
    form.append("model", req.model);
    form.append("response_format", req.response_format ?? "json");

    const headers: HeadersInit = {
      "HTTP-Referer": "https://github.com/rakanssh/hakawati",
      "X-Title": "Hakawati",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    };

    const r = await fetch(`${base}/audio/transcriptions`, {
      method: "POST",
      headers,
      body: form,
      signal,
    });

    if (!r.ok) {
      throw new Error(await r.text());
    }

    const json = await r.json();
    const text = typeof json?.text === "string" ? json.text.trim() : "";
    if (!text) {
      throw new Error("Transcription returned no text.");
    }

    return { text, raw: json };
  }

  async function transcribeOpenRouterAudio(
    req: AudioTranscriptionRequest,
    signal?: AbortSignal,
  ): Promise<AudioTranscriptionResponse> {
    const format = audioFormatFromBlob(req.file);
    const body = {
      model: req.model,
      input_audio: {
        data: await blobToBase64(req.file),
        format,
      },
    };

    const headers: HeadersInit = {
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/rakanssh/hakawati",
      "X-Title": "Hakawati",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    };

    const r = await fetch(`${base}/audio/transcriptions`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });

    if (!r.ok) {
      throw new Error(await r.text());
    }

    const json = await r.json();
    const text = typeof json?.text === "string" ? json.text.trim() : "";
    if (!text) {
      throw new Error("Transcription returned no text.");
    }

    return { text, raw: json };
  }

  async function synthesizeSpeech(
    req: AudioSpeechRequest,
    signal?: AbortSignal,
  ): Promise<AudioSpeechResponse> {
    const headers: HeadersInit = {
      "Content-Type": "application/json",
      "HTTP-Referer": "https://github.com/rakanssh/hakawati",
      "X-Title": "Hakawati",
      ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
    };

    const r = await fetch(`${base}/audio/speech`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: req.model,
        input: req.input,
        voice: req.voice,
        response_format: req.response_format ?? "mp3",
      }),
      signal,
    });

    if (!r.ok) {
      throw new Error(await readErrorMessage(r, "Speech synthesis failed"));
    }

    const buffer = await r.arrayBuffer();
    if (buffer.byteLength === 0) {
      throw new Error("Speech synthesis returned no audio.");
    }
    const contentType = r.headers.get("content-type") || "audio/mpeg";

    return {
      audio: new Blob([buffer], { type: contentType }),
      raw: r,
    };
  }

  return { chat, models, transcribeAudio, synthesizeSpeech };
}

function audioFormatFromBlob(blob: Blob): string {
  const mime = blob.type.split(";")[0].toLowerCase();
  switch (mime) {
    case "audio/wav":
    case "audio/wave":
    case "audio/x-wav":
      return "wav";
    case "audio/mpeg":
    case "audio/mp3":
      return "mp3";
    case "audio/flac":
      return "flac";
    case "audio/mp4":
    case "audio/m4a":
      return "m4a";
    case "audio/ogg":
      return "ogg";
    case "audio/aac":
      return "aac";
    case "audio/webm":
    default:
      return "webm";
  }
}

async function blobToBase64(blob: Blob): Promise<string> {
  const readableBlob = blob as Blob & {
    arrayBuffer?: () => Promise<ArrayBuffer>;
  };
  const buffer =
    typeof readableBlob.arrayBuffer === "function"
      ? await readableBlob.arrayBuffer()
      : typeof FileReader !== "undefined"
        ? await readBlobWithFileReader(blob)
        : await new Response(blob).arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

function readBlobWithFileReader(blob: Blob): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (reader.result instanceof ArrayBuffer) {
        resolve(reader.result);
      } else {
        reject(new Error("Could not read audio data."));
      }
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error("Could not read audio data."));
    reader.readAsArrayBuffer(blob);
  });
}

function readSupportedVoices(
  model: Record<string, unknown>,
): string[] | undefined {
  for (const key of ["supported_voices", "supportedVoices", "voices"]) {
    const voices = model[key];
    if (!Array.isArray(voices)) continue;
    const supportedVoices = voices.filter(
      (voice: unknown): voice is string =>
        typeof voice === "string" && voice.trim().length > 0,
    );
    if (supportedVoices.length > 0) return [...new Set(supportedVoices)];
  }
  return undefined;
}

async function readErrorMessage(
  response: Response,
  fallback: string,
): Promise<string> {
  const text = await response.text().catch(() => "");
  if (text.trim()) {
    try {
      const json = JSON.parse(text) as unknown;
      const message = extractErrorMessage(json);
      if (message) return message;
    } catch {
      return text;
    }
    return text;
  }

  const generationId = response.headers.get("x-generation-id");
  return [
    fallback,
    `(${response.status} ${response.statusText || "Error"})`,
    generationId ? `generation ${generationId}` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

function extractErrorMessage(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const error = obj.error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const errorObj = error as Record<string, unknown>;
    const metadata = errorObj.metadata;
    if (metadata && typeof metadata === "object") {
      const metadataObj = metadata as Record<string, unknown>;
      if (typeof metadataObj.raw === "string") return metadataObj.raw;
    }
    if (typeof errorObj.message === "string") return errorObj.message;
    if (typeof errorObj.detail === "string") return errorObj.detail;
    if (typeof errorObj.code === "string") return errorObj.code;
  }
  if (typeof obj.message === "string") return obj.message;
  if (typeof obj.detail === "string") return obj.detail;
  return null;
}

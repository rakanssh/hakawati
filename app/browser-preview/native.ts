// Keep exports used by transitive Tauri dependencies; override only invoke.
export * from "../../node_modules/@tauri-apps/api/core.js";
import Database from "./sql";
import { version } from "../../package.json";

export const getVersion = async () => version;
export const appLocalDataDir = async () => "browser-preview";
export const join = async (...parts: string[]) => parts.join("/");
export const writeText = (text: string) => navigator.clipboard.writeText(text);
export const readText = () => navigator.clipboard.readText();
export async function openUrl(url: string) {
  if (!/^(https?:\/\/|mailto:)/i.test(url))
    throw new Error("Preview only supports web and email links");
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function invoke<T>(
  command: string,
  args: Record<string, unknown> = {},
): Promise<T> {
  if (command === "begin_database_transaction")
    return (await (await Database.load()).beginTransaction()) as T;
  if (command === "query_database_transaction") {
    return (await Database.load()).queryTransaction(
      Number(args.id),
      String(args.sql),
      (args.values ?? []) as unknown[],
      Boolean(args.select),
    ) as T;
  }
  if (command === "end_database_transaction") {
    (await Database.load()).endTransaction(
      Number(args.id),
      Boolean(args.commit),
    );
    return undefined as T;
  }
  throw new Error(
    "This feature requires the desktop app and is unavailable in browser preview.",
  );
}

export const PREVIEW_BASE_URL = "https://preview.invalid/v1";
export const PREVIEW_MODEL = {
  id: "preview-narrator",
  name: "Preview narrator (scripted)",
  contextLength: 8192,
};

/** Preview stays offline: the narrator is scripted and cloud requests fail clearly. */
export async function fetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  init?.signal?.throwIfAborted();
  const url = String(input);
  if (url === `${PREVIEW_BASE_URL}/models`)
    return Response.json({ data: [PREVIEW_MODEL] });
  if (url === `${PREVIEW_BASE_URL}/chat/completions`) {
    const request = JSON.parse(String(init?.body ?? "{}"));
    const content =
      "*Scripted browser preview response.*\n\nThe lantern flickers. Somewhere beyond the doorway, footsteps pause, and a folded note slides across the threshold. You have a moment to decide what to do next.";
    if (request.stream) {
      const data = `data: ${JSON.stringify({ choices: [{ index: 0, delta: { content }, finish_reason: null }] })}\n\ndata: ${JSON.stringify({ choices: [{ index: 0, delta: {}, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`;
      return new Response(data, {
        headers: { "Content-Type": "text/event-stream" },
      });
    }
    return Response.json({
      choices: [
        { message: { role: "assistant", content }, finish_reason: "stop" },
      ],
      usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
    });
  }
  return new Response(
    "Cloud, external inference, and audio are unavailable in browser preview. Use the desktop app for these features.",
    { status: 503 },
  );
}

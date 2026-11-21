// Keep exports used by transitive Tauri dependencies; override only invoke.
export * from "../../node_modules/@tauri-apps/api/core.js";
import Database from "./sql";
import { scriptedChatCompletion } from "./scripted-models";
import { version } from "../../package.json";

export const getVersion = async () => version;
export const onBackButtonPress = async () => ({ unregister: async () => {} });
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
  supportsToolCalls: true,
  supportsImages: true,
};
const PREVIEW_PLAIN_MODEL = {
  id: "preview-plain",
  name: "Preview plain (no tools)",
  contextLength: 4096,
  supportsToolCalls: false,
  supportsImages: false,
};

/** Preview stays offline: the narrator is scripted and cloud requests fail clearly. */
export async function fetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  init?.signal?.throwIfAborted();
  const url = String(input);
  if (url === `${PREVIEW_BASE_URL}/models`)
    return Response.json({ data: [PREVIEW_MODEL, PREVIEW_PLAIN_MODEL] });
  if (url === `${PREVIEW_BASE_URL}/chat/completions`)
    return scriptedChatCompletion(JSON.parse(String(init?.body ?? "{}")));
  return new Response(
    "Cloud, external inference, and audio are unavailable in browser preview. Use the desktop app for these features.",
    { status: 503 },
  );
}

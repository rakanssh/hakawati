import { writeText, readText } from "@tauri-apps/plugin-clipboard-manager";

export async function copyTextToClipboard(text: string): Promise<void> {
  if (!text) return;
  try {
    await writeText(text);
    return;
  } catch (e) {
    console.error("Failed to copy text to clipboard", e);
    throw e;
  }
}

export async function readTextFromClipboard(): Promise<string> {
  try {
    return await readText();
  } catch (e) {
    console.error("Failed to read text from clipboard", e);
    throw e;
  }
}

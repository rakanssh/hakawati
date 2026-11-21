import { useTaleStore } from "@/store/useTaleStore";
import { withTaleWrites } from "../tale-edits";
import { requireUi, text, type AssistantToolContext } from "./define";

export async function openTaleNamed(
  context: AssistantToolContext,
  taleId: string,
  signal?: AbortSignal,
): Promise<string> {
  const ui = requireUi(context);
  await withTaleWrites(signal, () => ui.openTale(taleId));
  return useTaleStore.getState().name;
}

export const outputName = (output: unknown) =>
  output && typeof output === "object" && "name" in output
    ? text((output as { name: unknown }).name)
    : undefined;

import type { LLMModel } from "@/types";

/** A model typed in by id. Refreshing the provider's list keeps it even when the list doesn't include it. */
export function manualModel(id: string): LLMModel {
  return { id, name: id, manual: true };
}

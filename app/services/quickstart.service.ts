import { nanoid } from "nanoid";
import { createPromptComponent } from "@/lib/prompt-components";
import {
  generateQuickstartTale,
  type QuickstartTaleAnswers,
} from "@/services/llm/quickstartTaleGenerator";
import { markNewTaleSyncPreference } from "@/services/new-tale-sync";
import { initTale } from "@/services/tale.service";
import {
  PromptComponentType,
  type PromptComponent,
} from "@/types/context.type";
import { LogEntryRole } from "@/types/log.type";

function aborted() {
  return new DOMException("Request cancelled.", "AbortError");
}

/** Writes a new tale from Quickstart answers with the helper model and saves it. Returns its id. */
export async function createQuickstartTale(
  answers: QuickstartTaleAnswers,
  options: {
    private?: boolean;
    signal?: AbortSignal;
    onSaving?: () => void;
  } = {},
): Promise<string> {
  const generated = await generateQuickstartTale(answers, options.signal);
  if (options.signal?.aborted) throw aborted();
  options.onSaving?.();

  const components: PromptComponent[] = [
    createPromptComponent(PromptComponentType.PLOT, generated.plot),
  ];
  if (generated.authorNote.trim())
    components.push(
      createPromptComponent(
        PromptComponentType.AUTHOR_NOTE,
        generated.authorNote,
      ),
    );

  const taleId = await initTale({
    name: generated.name,
    description: generated.description,
    thumbnail: null,
    components,
    storyCards: generated.storyCards,
    scenarioId: undefined,
    stats: generated.stats,
    inventory: generated.inventory,
    log: generated.openingText
      ? [{ id: nanoid(12), role: LogEntryRole.GM, text: generated.openingText }]
      : [],
    gameMode: answers.gameMode,
    undoStack: [],
  });
  await markNewTaleSyncPreference(
    taleId,
    options.private ? "private" : "default",
  );
  return taleId;
}

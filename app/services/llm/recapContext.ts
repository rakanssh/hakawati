import {
  getOlderRecaps,
  type StoredRecap,
} from "@/repositories/tale.repository";
import {
  DEFAULT_RECAP_SHARE,
  MAX_RECAP_SHARE,
  MIN_RECAP_SHARE,
} from "@/lib/recaps";
import { useSettingsStore } from "@/store/useSettingsStore";
import {
  assembleContextMessages,
  countRecapTokens,
  type AssembleContextMessagesParams,
  type AssembleContextMessagesResult,
} from "./contextAssembly";

const OLDER_RECAP_TURNS_PER_PAGE = 200;
const OLDER_RECAP_MAX_PAGES = 10;

export interface RecapBudget {
  historyBudget: number;
  share: number;
}

const budgets = new Map<string, RecapBudget>();

export function getRecapBudget(taleId: string): RecapBudget | undefined {
  return budgets.get(taleId);
}

export function storyRecapsEnabled(): boolean {
  return useSettingsStore.getState().storyRecaps === true;
}

export function recapShareFraction(percent: number | undefined): number {
  const value = Number.isFinite(percent) ? percent! : DEFAULT_RECAP_SHARE;
  return Math.min(MAX_RECAP_SHARE, Math.max(MIN_RECAP_SHARE, value)) / 100;
}

async function loadOlderRecaps(
  taleId: string,
  beforeIndex: number,
  tokenGoal: number,
): Promise<StoredRecap[]> {
  const recaps: StoredRecap[] = [];
  let tokens = 0;
  let cursor: number | null = beforeIndex;
  for (
    let page = 0;
    page < OLDER_RECAP_MAX_PAGES && cursor !== null && tokens < tokenGoal;
    page += 1
  ) {
    const result = await getOlderRecaps(
      taleId,
      cursor,
      OLDER_RECAP_TURNS_PER_PAGE,
    );
    // Recaps run back from the newest one without gaps wider than a page.
    if (result.recaps.length === 0) break;
    for (const recap of result.recaps) {
      recaps.push(recap);
      tokens += countRecapTokens(recap.lines);
    }
    cursor = result.nextBeforeIndex;
  }
  return recaps;
}

export async function assembleStoryContext(
  params: AssembleContextMessagesParams,
  source: { taleId: string; oldestLoadedIndex: number; isNarrator: boolean },
): Promise<AssembleContextMessagesResult> {
  if (!storyRecapsEnabled()) return assembleContextMessages(params);

  const share = recapShareFraction(useSettingsStore.getState().recapShare);
  const warnings: Array<() => void> = [];
  const deferred: Partial<AssembleContextMessagesParams> = {
    onRequiredTokensExceeded: (tokens) =>
      warnings.push(() => params.onRequiredTokensExceeded?.(tokens)),
    onRequiredWithPinnedExceeded: (tokens) =>
      warnings.push(() => params.onRequiredWithPinnedExceeded?.(tokens)),
    onNoHistoryIncluded: () =>
      warnings.push(() => params.onNoHistoryIncluded?.()),
  };

  let result = assembleContextMessages({
    ...params,
    ...deferred,
    recaps: { share },
  });
  if (result.recap?.needsOlderRecaps && source.oldestLoadedIndex > 0) {
    const older = await loadOlderRecaps(
      source.taleId,
      source.oldestLoadedIndex,
      result.recap.historyBudget,
    ).catch((error: unknown) => {
      console.warn("Failed to read older story recaps:", error);
      return [];
    });
    if (older.length > 0) {
      warnings.length = 0;
      result = assembleContextMessages({
        ...params,
        ...deferred,
        recaps: { share, older },
      });
    }
  }

  warnings.forEach((warn) => warn());
  if (source.isNarrator && result.recap) {
    budgets.set(source.taleId, {
      historyBudget: result.recap.historyBudget,
      share,
    });
  }
  return result;
}

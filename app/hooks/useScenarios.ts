import { useCallback, useState } from "react";
import {
  removeScenario,
  saveScenario,
  initTaleFromScenario,
  getScenarioById,
  getAllScenarios,
  serializeScenarioExportV1,
  deserializeScenarioExportV1,
} from "@/services/scenario.service";
import { useLoadTale } from "@/hooks/useGameSaves";
import { GameMode, Scenario, ScenarioHead } from "@/types/context.type";
import { usePaginatedList } from "@/hooks/usePaginatedList";
import { copyTextToClipboard, readTextFromClipboard } from "@/lib/clipboard";
import { toast } from "sonner";

export function useScenariosList(initialPage = 1, initialLimit = 12) {
  const {
    items,
    page,
    limit,
    total,
    setPage,
    setLimit,
    loading,
    error,
    refresh,
  } = usePaginatedList<ScenarioHead>(
    getAllScenarios,
    initialPage,
    initialLimit,
  );

  const remove = useCallback(
    async (id: string) => {
      await removeScenario(id);
      await refresh();
    },
    [refresh],
  );

  return {
    items,
    page,
    limit,
    total,
    setPage,
    setLimit,
    loading,
    error,
    refresh,
    remove,
  } as const;
}

export function useScenarioEditor(initial?: Partial<Scenario>) {
  const [scenario, setScenario] = useState<Scenario>({
    id: initial?.id ?? "",
    name: initial?.name ?? "Untitled Scenario",
    initialGameMode: initial?.initialGameMode ?? GameMode.STORY_TELLER,
    initialDescription: initial?.initialDescription ?? "",
    initialAuthorNote: initial?.initialAuthorNote ?? "",
    openingText: initial?.openingText ?? "",
    initialStats: initial?.initialStats ?? [],
    initialInventory: initial?.initialInventory ?? [],
    initialStoryCards: initial?.initialStoryCards ?? [],
    thumbnail: initial?.thumbnail ?? null,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async (id: string) => {
    const loaded = await getScenarioById(id);
    if (loaded) setScenario(loaded);
  }, []);

  const save = useCallback(async () => {
    setSaving(true);
    setError(null);
    try {
      const id = await saveScenario(scenario, scenario.id || undefined);
      setScenario((s) => ({ ...s, id }));
      return id;
    } catch (e) {
      setError(e);
      throw e;
    } finally {
      setSaving(false);
    }
  }, [scenario]);

  const { load: loadTale } = useLoadTale();
  const startTale = useCallback(async () => {
    if (!scenario.id) {
      const id = await save();
      const taleId = await initTaleFromScenario(id);
      await loadTale(taleId);
      return taleId;
    }
    const taleId = await initTaleFromScenario(scenario.id);
    await loadTale(taleId);
    return taleId;
  }, [scenario.id, save, loadTale]);

  return {
    scenario,
    setScenario,
    load,
    save,
    saving,
    error,
    startTale,
  } as const;
}

export function useScenariosExport() {
  const exportById = useCallback(async (id: string) => {
    const scenario = await getScenarioById(id);
    if (!scenario) {
      toast.error("Scenario not found");
      return;
    }
    const json = serializeScenarioExportV1(scenario);
    await copyTextToClipboard(json);
    toast.success("Scenario JSON copied to clipboard");
  }, []);

  const exportFromValue = useCallback(async (scenario: Scenario) => {
    const json = serializeScenarioExportV1(scenario);
    await copyTextToClipboard(json);
    toast.success("Scenario JSON copied to clipboard");
  }, []);

  return { exportById, exportFromValue } as const;
}

export function useScenariosImport() {
  const importFromClipboard = useCallback(async () => {
    const raw = await readTextFromClipboard();
    const scenario = deserializeScenarioExportV1(raw);
    return scenario;
  }, []);

  return { importFromClipboard } as const;
}

import { beforeEach, describe, expect, it, vi } from "vitest";
import { enqueueLocalOperation } from "@/lib/local-write-queue";
import { addSyncWakeListener } from "@/services/sync-wakeup";
import { useTaleStore } from "@/store/useTaleStore";
import { GameMode } from "@/types/context.type";
import {
  holdOpenTaleForPlay,
  isTaleInPlay,
  showPulledTale,
} from "./open-tale-sync";

const taleService = vi.hoisted(() => ({ getTaleById: vi.fn() }));

vi.mock("@/services/tale.service", () => taleService);
vi.mock("@/prompts", () => ({ getActiveStorytellerPrompt: () => "" }));

function pulledTale(name: string) {
  return {
    id: "open-tale",
    name,
    description: "From another device",
    components: [],
    storyCards: [],
    stats: [],
    inventory: [],
    log: [{ id: "entry-1", role: "gm", text: "Pulled turn." }],
    gameMode: GameMode.GM,
    undoStack: [],
    totalLogCount: 1,
    oldestLoadedIndex: 0,
  };
}

describe("open tale sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useTaleStore.setState({
      id: "open-tale",
      loadingTaleId: null,
      name: "Before the pull",
      log: [],
    });
  });

  it("holds the tale on the play screen until its queued saves land", async () => {
    const wake = vi.fn();
    const removeWakeListener = addSyncWakeListener(wake);
    expect(isTaleInPlay("open-tale")).toBe(false);

    const release = holdOpenTaleForPlay();
    expect(isTaleInPlay("open-tale")).toBe(true);
    expect(isTaleInPlay("other-tale")).toBe(false);
    useTaleStore.setState({ loadingTaleId: "next-tale" });
    expect(isTaleInPlay("next-tale")).toBe(true);
    useTaleStore.setState({ loadingTaleId: null });

    let releasedBeforeSave = true;
    let finishSave!: () => void;
    void enqueueLocalOperation(async () => {
      await new Promise<void>((resolve) => {
        finishSave = resolve;
      });
      releasedBeforeSave = !isTaleInPlay("open-tale");
    });
    release();
    await Promise.resolve();
    expect(isTaleInPlay("open-tale")).toBe(true);

    finishSave();
    await enqueueLocalOperation(async () => undefined);
    await Promise.resolve();
    expect(releasedBeforeSave).toBe(false);
    expect(isTaleInPlay("open-tale")).toBe(false);
    expect(wake).toHaveBeenCalledOnce();
    removeWakeListener();
  });

  it("shows the pulled version in the open tale", async () => {
    taleService.getTaleById.mockResolvedValue(pulledTale("After the pull"));

    await showPulledTale("open-tale");

    expect(taleService.getTaleById).toHaveBeenCalledWith("open-tale");
    expect(useTaleStore.getState()).toMatchObject({
      id: "open-tale",
      name: "After the pull",
      description: "From another device",
      gameMode: GameMode.GM,
      log: [{ id: "entry-1", text: "Pulled turn." }],
      totalLogCount: 1,
    });
  });

  it("leaves another tale alone, even one opened during the read", async () => {
    await showPulledTale("closed-tale");
    expect(taleService.getTaleById).not.toHaveBeenCalled();

    taleService.getTaleById.mockImplementation(async () => {
      useTaleStore.setState({ id: "other-tale", name: "Opened meanwhile" });
      return pulledTale("After the pull");
    });
    await showPulledTale("open-tale");

    expect(useTaleStore.getState()).toMatchObject({
      id: "other-tale",
      name: "Opened meanwhile",
    });
  });
});

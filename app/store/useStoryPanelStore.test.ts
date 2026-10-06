import { beforeEach, describe, expect, it } from "vitest";
import { STORY_PANEL_WIDTH, useStoryPanelStore } from "./useStoryPanelStore";

describe("story panel store", () => {
  beforeEach(() => {
    localStorage.clear();
    useStoryPanelStore.setState({
      open: false,
      tab: "story",
      width: STORY_PANEL_WIDTH.default,
    });
  });

  it("toggles open and remembers the tab", () => {
    const { toggle, setTab } = useStoryPanelStore.getState();
    toggle();
    setTab("cards");
    expect(useStoryPanelStore.getState()).toMatchObject({
      open: true,
      tab: "cards",
    });
    toggle();
    expect(useStoryPanelStore.getState().open).toBe(false);
  });

  it("ignores saved tabs it no longer knows", async () => {
    localStorage.setItem(
      "story-panel",
      JSON.stringify({ state: { open: true, tab: "lorebook" }, version: 0 }),
    );
    await useStoryPanelStore.persist.rehydrate();
    expect(useStoryPanelStore.getState()).toMatchObject({
      open: true,
      tab: "story",
    });
  });

  it("keeps the width within its limits", async () => {
    useStoryPanelStore.getState().setWidth(10_000);
    expect(useStoryPanelStore.getState().width).toBe(STORY_PANEL_WIDTH.max);
    useStoryPanelStore.getState().setWidth(12);
    expect(useStoryPanelStore.getState().width).toBe(STORY_PANEL_WIDTH.min);

    localStorage.setItem(
      "story-panel",
      JSON.stringify({ state: { width: "wide" }, version: 0 }),
    );
    await useStoryPanelStore.persist.rehydrate();
    expect(useStoryPanelStore.getState().width).toBe(STORY_PANEL_WIDTH.min);
  });
});

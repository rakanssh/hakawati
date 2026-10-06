import { create } from "zustand";
import { persist } from "zustand/middleware";

export const STORY_PANEL_TABS = [
  "story",
  "cards",
  "character",
  "ai",
  "display",
] as const;

export type StoryPanelTab = (typeof STORY_PANEL_TABS)[number];

/** Panel widths in CSS pixels. */
export const STORY_PANEL_WIDTH = { default: 384, min: 288, max: 672 };

interface StoryPanelStoreType {
  open: boolean;
  tab: StoryPanelTab;
  width: number;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  setTab: (tab: StoryPanelTab) => void;
  setWidth: (width: number) => void;
}

const clampWidth = (width: number) =>
  Math.round(
    Math.min(
      STORY_PANEL_WIDTH.max,
      Math.max(STORY_PANEL_WIDTH.min, Number.isFinite(width) ? width : 0),
    ),
  );

/** The play screen's story panel: whether it is open, which tab it shows and how wide it is, kept between sessions. */
export const useStoryPanelStore = create<StoryPanelStoreType>()(
  persist(
    (set) => ({
      open: false,
      tab: "story",
      width: STORY_PANEL_WIDTH.default,
      setOpen: (open) => set({ open }),
      toggle: () => set((state) => ({ open: !state.open })),
      setTab: (tab) => set({ tab }),
      setWidth: (width) => set({ width: clampWidth(width) }),
    }),
    {
      name: "story-panel",
      partialize: (state) => ({
        open: state.open,
        tab: state.tab,
        width: state.width,
      }),
      merge: (persisted, current) => {
        const saved = (persisted ?? {}) as Partial<StoryPanelStoreType>;
        return {
          ...current,
          open: saved.open === true,
          tab: STORY_PANEL_TABS.includes(saved.tab as StoryPanelTab)
            ? (saved.tab as StoryPanelTab)
            : current.tab,
          width:
            typeof saved.width === "number"
              ? clampWidth(saved.width)
              : current.width,
        };
      },
    },
  ),
);

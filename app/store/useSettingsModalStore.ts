import { create } from "zustand";

export const SETTINGS_TABS = [
  "appearance",
  "ai-setup",
  "generation",
  "prompting",
  "cloud-sync",
  "maintenance",
  "about",
] as const;

export type SettingsTab = (typeof SETTINGS_TABS)[number];

interface SettingsModalStoreType {
  open: boolean;
  tab?: SettingsTab;
  /** Counts openings, so each one starts on its own tab. */
  opened: number;
  openSettings: (tab?: SettingsTab) => void;
  setOpen: (open: boolean) => void;
}

export const useSettingsModalStore = create<SettingsModalStoreType>()(
  (set) => ({
    open: false,
    opened: 0,
    openSettings: (tab) =>
      set((state) => ({ open: true, tab, opened: state.opened + 1 })),
    setOpen: (open) => set({ open }),
  }),
);

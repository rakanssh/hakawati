import { create } from "zustand";
import { persist } from "zustand/middleware";

interface VersionState {
  lastSeenVersion: string | null;
  setLastSeenVersion: (version: string) => void;
}

export const useVersionStore = create<VersionState>()(
  persist(
    (set) => ({
      lastSeenVersion: null,
      setLastSeenVersion: (version: string) =>
        set({ lastSeenVersion: version }),
    }),
    {
      name: "version-store",
    },
  ),
);

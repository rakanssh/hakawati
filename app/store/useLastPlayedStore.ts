import { create } from "zustand";
import { persist } from "zustand/middleware";

interface LastPlayedStoreType {
  lastPlayedTaleId: string | null;
  setLastPlayedTaleId: (id: string | null) => void;
}

export const useLastPlayedStore = create<LastPlayedStoreType>()(
  persist<LastPlayedStoreType>(
    (set) => ({
      lastPlayedTaleId: null,
      setLastPlayedTaleId: (id: string | null) => set({ lastPlayedTaleId: id }),
    }),
    {
      name: "last-played",
    },
  ),
);

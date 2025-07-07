import { create } from "zustand";

const enum ApiType {
  OPENROUTER = "openrouter",
}

interface SettingsStoreType {
  apiKey: string;
  apiType: ApiType;
  setApiKey: (apiKey: string) => void;
  setApiType: (apiType: ApiType) => void;
}

export const useSettingsStore = create<SettingsStoreType>((set) => ({
  apiKey: "",
  apiType: ApiType.OPENROUTER,
  setApiKey: (apiKey: string) => set({ apiKey }),
  setApiType: (apiType: ApiType) => set({ apiType }),
}));

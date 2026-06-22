import { create } from "zustand";
import { persist } from "zustand/middleware";

type SyncSettingsPersistedState = Pick<
  SyncSettingsStore,
  | "cloudBaseUrl"
  | "personalBaseUrl"
  | "activeSyncMode"
  | "accessToken"
  | "accessTokenExpiresAt"
  | "refreshToken"
  | "deviceId"
  | "deviceName"
  | "devicePlatform"
  | "accountDisplayName"
  | "accountEmail"
  | "accountEmailVerified"
  | "syncAllPromptAnswered"
>;

export interface SyncSettingsStore {
  cloudBaseUrl: string;
  personalBaseUrl: string;
  activeSyncMode: "hosted" | "personal";
  accessToken: string;
  accessTokenExpiresAt: number | null;
  refreshToken: string;
  deviceId: string;
  deviceName: string;
  devicePlatform: string;
  accountDisplayName: string;
  accountEmail: string;
  accountEmailVerified: boolean | null;
  showSyncAllPrompt: boolean;
  syncAllPromptAnswered: boolean;
  setCloudBaseUrl: (baseUrl: string) => void;
  setPersonalBaseUrl: (baseUrl: string) => void;
  setActiveSyncMode: (mode: "hosted" | "personal") => void;
  setAccessToken: (
    accessToken: string,
    expiresAt?: number | null,
    refreshToken?: string | null,
  ) => void;
  setAccount: (account: {
    displayName?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }) => void;
  setShowSyncAllPrompt: (showSyncAllPrompt: boolean) => void;
  setSyncAllPromptAnswered: (syncAllPromptAnswered: boolean) => void;
  clearSession: () => void;
  setDeviceId: (deviceId: string) => void;
  setDeviceName: (deviceName: string) => void;
  setDevicePlatform: (devicePlatform: string) => void;
}

function createDeviceId() {
  return globalThis.crypto?.randomUUID?.() ?? `device-${Date.now()}`;
}

function defaultDeviceName() {
  return globalThis.navigator?.platform || "Hakawati device";
}

export const useSyncSettingsStore = create<SyncSettingsStore>()(
  persist<SyncSettingsStore, [], [], SyncSettingsPersistedState>(
    (set) => ({
      cloudBaseUrl: "",
      personalBaseUrl: "",
      activeSyncMode: "hosted",
      accessToken: "",
      accessTokenExpiresAt: null,
      refreshToken: "",
      deviceId: createDeviceId(),
      deviceName: defaultDeviceName(),
      devicePlatform: defaultDeviceName(),
      accountDisplayName: "",
      accountEmail: "",
      accountEmailVerified: null,
      showSyncAllPrompt: false,
      syncAllPromptAnswered: false,
      setCloudBaseUrl: (cloudBaseUrl) => set({ cloudBaseUrl }),
      setPersonalBaseUrl: (personalBaseUrl) => set({ personalBaseUrl }),
      setActiveSyncMode: (activeSyncMode) => set({ activeSyncMode }),
      setAccessToken: (
        accessToken,
        accessTokenExpiresAt = null,
        refreshToken,
      ) =>
        set((state) => ({
          accessToken,
          accessTokenExpiresAt,
          // ponytail: persisted with sync settings; move to OS keychain when a secure-store plugin lands.
          refreshToken: refreshToken ?? state.refreshToken,
        })),
      setAccount: (account) =>
        set({
          accountDisplayName: account.displayName ?? "",
          accountEmail: account.email ?? "",
          accountEmailVerified: account.emailVerified ?? null,
        }),
      setShowSyncAllPrompt: (showSyncAllPrompt) => set({ showSyncAllPrompt }),
      setSyncAllPromptAnswered: (syncAllPromptAnswered) =>
        set({ syncAllPromptAnswered }),
      clearSession: () =>
        set({
          accessToken: "",
          accessTokenExpiresAt: null,
          refreshToken: "",
          accountDisplayName: "",
          accountEmail: "",
          accountEmailVerified: null,
          showSyncAllPrompt: false,
        }),
      setDeviceId: (deviceId) => set({ deviceId }),
      setDeviceName: (deviceName) => set({ deviceName }),
      setDevicePlatform: (devicePlatform) => set({ devicePlatform }),
    }),
    {
      name: "sync-settings",
      partialize: (state) => ({
        cloudBaseUrl: state.cloudBaseUrl,
        personalBaseUrl: state.personalBaseUrl,
        activeSyncMode: state.activeSyncMode,
        accessToken: state.accessToken,
        accessTokenExpiresAt: state.accessTokenExpiresAt,
        refreshToken: state.refreshToken,
        deviceId: state.deviceId,
        deviceName: state.deviceName,
        devicePlatform: state.devicePlatform,
        accountDisplayName: state.accountDisplayName,
        accountEmail: state.accountEmail,
        accountEmailVerified: state.accountEmailVerified,
        syncAllPromptAnswered: state.syncAllPromptAnswered,
      }),
    },
  ),
);

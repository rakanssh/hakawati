import { create } from "zustand";
import { persist } from "zustand/middleware";

type SyncSettingsPersistedState = Pick<
  SyncSettingsStore,
  | "cloudBaseUrl"
  | "personalBaseUrl"
  | "activeSyncMode"
  | "accessToken"
  | "accessTokenExpiresAt"
  | "hasRefreshToken"
  | "deviceId"
  | "deviceName"
  | "devicePlatform"
  | "accountDisplayName"
  | "accountEmail"
  | "accountEmailVerified"
>;

export interface SyncSettingsStore {
  cloudBaseUrl: string;
  personalBaseUrl: string;
  activeSyncMode: "hosted" | "personal";
  accessToken: string;
  accessTokenExpiresAt: number | null;
  hasRefreshToken: boolean;
  deviceId: string;
  deviceName: string;
  devicePlatform: string;
  accountDisplayName: string;
  accountEmail: string;
  accountEmailVerified: boolean | null;
  hostedRefreshFailed: boolean;
  setCloudBaseUrl: (baseUrl: string) => void;
  setPersonalBaseUrl: (baseUrl: string) => void;
  setActiveSyncMode: (mode: "hosted" | "personal") => void;
  setAccessToken: (
    accessToken: string,
    expiresAt?: number | null,
    hasRefreshToken?: boolean,
  ) => void;
  setHasRefreshToken: (hasRefreshToken: boolean) => void;
  setAccount: (account: {
    displayName?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  }) => void;
  setHostedRefreshFailed: (hostedRefreshFailed: boolean) => void;
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
      hasRefreshToken: false,
      deviceId: createDeviceId(),
      deviceName: defaultDeviceName(),
      devicePlatform: defaultDeviceName(),
      accountDisplayName: "",
      accountEmail: "",
      accountEmailVerified: null,
      hostedRefreshFailed: false,
      setCloudBaseUrl: (cloudBaseUrl) => set({ cloudBaseUrl }),
      setPersonalBaseUrl: (personalBaseUrl) => set({ personalBaseUrl }),
      setActiveSyncMode: (activeSyncMode) => set({ activeSyncMode }),
      setAccessToken: (
        accessToken,
        accessTokenExpiresAt = null,
        hasRefreshToken,
      ) =>
        set((state) => ({
          accessToken,
          accessTokenExpiresAt,
          hostedRefreshFailed: false,
          hasRefreshToken: hasRefreshToken ?? state.hasRefreshToken,
        })),
      setHasRefreshToken: (hasRefreshToken) => set({ hasRefreshToken }),
      setAccount: (account) =>
        set({
          accountDisplayName: account.displayName ?? "",
          accountEmail: account.email ?? "",
          accountEmailVerified: account.emailVerified ?? null,
        }),
      setHostedRefreshFailed: (hostedRefreshFailed) =>
        set({ hostedRefreshFailed }),
      clearSession: () =>
        set({
          accessToken: "",
          accessTokenExpiresAt: null,
          hasRefreshToken: false,
          hostedRefreshFailed: false,
          accountDisplayName: "",
          accountEmail: "",
          accountEmailVerified: null,
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
        hasRefreshToken: state.hasRefreshToken,
        deviceId: state.deviceId,
        deviceName: state.deviceName,
        devicePlatform: state.devicePlatform,
        accountDisplayName: state.accountDisplayName,
        accountEmail: state.accountEmail,
        accountEmailVerified: state.accountEmailVerified,
      }),
    },
  ),
);

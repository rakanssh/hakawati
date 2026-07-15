import { create } from "zustand";
import { persist } from "zustand/middleware";

type SyncSettingsPersistedState = Pick<
  SyncSettingsStore,
  | "cloudBaseUrl"
  | "personalBaseUrl"
  | "activeSyncMode"
  | "hasRefreshToken"
  | "deviceId"
  | "deviceName"
  | "devicePlatform"
  | "accountId"
  | "accountDisplayName"
  | "accountEmail"
  | "hostedDeviceIdsByAccountId"
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
  accountId: string;
  accountDisplayName: string;
  accountEmail: string;
  hostedDeviceIdsByAccountId: Record<string, string>;
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
    id?: string | null;
    displayName?: string | null;
    email?: string | null;
  }) => void;
  setHostedRefreshFailed: (hostedRefreshFailed: boolean) => void;
  clearSession: () => void;
  setDeviceId: (deviceId: string) => void;
  getOrCreateHostedDeviceId: (accountId: string) => string;
  setDeviceName: (deviceName: string) => void;
  setDevicePlatform: (devicePlatform: string) => void;
}

function createDeviceId() {
  return globalThis.crypto?.randomUUID?.() ?? `device-${Date.now()}`;
}

function defaultDeviceName() {
  return globalThis.navigator?.platform || "Hakawati device";
}

export function defaultCloudBaseUrl(
  value = import.meta.env.VITE_HAKAWATI_SYNC_SERVER_URL,
) {
  return value?.trim() ?? "";
}

function stripPersistedAccessToken(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  const safe = { ...(value as Record<string, unknown>) };
  delete safe.accessToken;
  delete safe.accessTokenExpiresAt;
  return safe;
}

export const useSyncSettingsStore = create<SyncSettingsStore>()(
  persist<SyncSettingsStore, [], [], SyncSettingsPersistedState>(
    (set, get) => ({
      cloudBaseUrl: defaultCloudBaseUrl(),
      personalBaseUrl: "",
      activeSyncMode: "hosted",
      accessToken: "",
      accessTokenExpiresAt: null,
      hasRefreshToken: false,
      deviceId: createDeviceId(),
      deviceName: defaultDeviceName(),
      devicePlatform: defaultDeviceName(),
      accountId: "",
      accountDisplayName: "",
      accountEmail: "",
      hostedDeviceIdsByAccountId: {},
      hostedRefreshFailed: false,
      setCloudBaseUrl: (cloudBaseUrl) =>
        set((state) =>
          cloudBaseUrl === state.cloudBaseUrl
            ? { cloudBaseUrl }
            : {
                cloudBaseUrl,
                accessToken: "",
                accessTokenExpiresAt: null,
                hasRefreshToken: false,
                hostedRefreshFailed: false,
                accountId: "",
                accountDisplayName: "",
                accountEmail: "",
              },
        ),
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
        set((state) => {
          const accountId = account.id ?? state.accountId;
          const hostedDeviceIdsByAccountId =
            accountId && !state.hostedDeviceIdsByAccountId[accountId]
              ? {
                  ...state.hostedDeviceIdsByAccountId,
                  [accountId]: createDeviceId(),
                }
              : state.hostedDeviceIdsByAccountId;
          return {
            accountId,
            accountDisplayName: account.displayName ?? "",
            accountEmail: account.email ?? "",
            hostedDeviceIdsByAccountId,
          };
        }),
      setHostedRefreshFailed: (hostedRefreshFailed) =>
        set({ hostedRefreshFailed }),
      clearSession: () =>
        set({
          accessToken: "",
          accessTokenExpiresAt: null,
          hasRefreshToken: false,
          hostedRefreshFailed: false,
          accountId: "",
          accountDisplayName: "",
          accountEmail: "",
        }),
      setDeviceId: (deviceId) => set({ deviceId }),
      getOrCreateHostedDeviceId: (accountId) => {
        const existing = get().hostedDeviceIdsByAccountId[accountId];
        if (existing) return existing;
        const deviceId = createDeviceId();
        set((state) => ({
          hostedDeviceIdsByAccountId: {
            ...state.hostedDeviceIdsByAccountId,
            [accountId]: deviceId,
          },
        }));
        return deviceId;
      },
      setDeviceName: (deviceName) => set({ deviceName }),
      setDevicePlatform: (devicePlatform) => set({ devicePlatform }),
    }),
    {
      name: "sync-settings",
      version: 1,
      migrate: (persistedState) =>
        stripPersistedAccessToken(persistedState) as SyncSettingsPersistedState,
      partialize: (state) => ({
        cloudBaseUrl: state.cloudBaseUrl,
        personalBaseUrl: state.personalBaseUrl,
        activeSyncMode: state.activeSyncMode,
        hasRefreshToken: state.hasRefreshToken,
        deviceId: state.deviceId,
        deviceName: state.deviceName,
        devicePlatform: state.devicePlatform,
        accountId: state.accountId,
        accountDisplayName: state.accountDisplayName,
        accountEmail: state.accountEmail,
        hostedDeviceIdsByAccountId: state.hostedDeviceIdsByAccountId,
      }),
      merge: (persistedState, currentState) => {
        const persisted = persistedState as
          | (Partial<SyncSettingsStore> & {
              accessToken?: unknown;
              accessTokenExpiresAt?: unknown;
            })
          | undefined;
        const safePersisted = stripPersistedAccessToken(persisted);
        return {
          ...currentState,
          ...safePersisted,
          accessToken: "",
          accessTokenExpiresAt: null,
          cloudBaseUrl: persisted?.cloudBaseUrl?.trim()
            ? persisted.cloudBaseUrl
            : currentState.cloudBaseUrl,
        };
      },
    },
  ),
);

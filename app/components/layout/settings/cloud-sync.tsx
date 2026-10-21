import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Cloud, UserRound } from "lucide-react";
import { toast } from "sonner";
import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import { useSettingsNavigation } from "@/components/layout/settings/settings-shell";
import {
  LinkRow,
  PlainRow,
  RowText,
  SetupList,
  SetupSection,
  StatusBanner,
  ToggleSwitch,
} from "@/components/layout/settings/settings-rows";
import { getSyncUiKind } from "@/lib/sync-ui";
import { HAKAWATI_CLIENT_VERSION } from "@/services/cloud-capabilities";
import { defaultCloudBaseUrl, useSyncSettingsStore } from "@/store";
import {
  getSyncProfile,
  setSyncProfileDisabled,
  upsertSyncProfile,
} from "@/repositories/sync.repository";
import {
  createSyncTransport,
  fetchHostedAccountUsage,
  listHostedDevices,
  prepareHostedSync,
  fetchSyncCapabilities,
  isHostedSignInCancelledError,
  HostedSignInCancelledError,
  registerSyncDevice,
  signInHostedSync,
  updateHostedAccountProfile,
  type HostedAccountUsage,
  type SyncDevice,
  type SyncProfile,
  unregisterHostedDevice,
} from "@/services/sync";
import {
  addSyncChangedListener,
  notifySyncChanged,
  wakeSyncBackground,
} from "@/services/sync-wakeup";
import {
  deleteHostedRefreshToken,
  setHostedRefreshToken,
} from "@/services/secret-store";
import {
  decideAllTaleSyncPreferences,
  decideTaleSyncPreference,
  listUndecidedTales,
  type UndecidedTale,
} from "@/services/new-tale-sync";
import { useTaleLibrary } from "@/hooks/useTaleLibrary";
import type { LibraryTaleItem } from "@/lib/tale-library";
import { cn, formatBytes, formatExactDateTime } from "@/lib/utils";

const HOSTED_PROFILE_ID = "hosted";
const PERSONAL_PROFILE_ID = "personal";
const PERSONAL_SYNC_ENABLED = false;
const PROFILE_UPDATE_TIMEOUT_MS = 15_000;
const HOSTED_DEVICE_LIMIT = 3;

function avatarInitial(label: string) {
  return (label.trim()[0] ?? "?").toUpperCase();
}

function withTimeout<T>(work: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    work,
    new Promise<never>((_, reject) =>
      window.setTimeout(
        () => reject(new Error("Profile update timed out")),
        timeoutMs,
      ),
    ),
  ]);
}

function formatMegabytes(bytes: number) {
  const value = bytes / (1024 * 1024);
  return `${value.toFixed(value === 0 || value >= 10 ? 0 : 1)} MB`;
}

function usagePercent(used: number, limit: number) {
  if (limit <= 0) return 0;
  return Math.min(100, Math.max(0, (used / limit) * 100));
}

function cloudStorageItem(item: LibraryTaleItem) {
  if (item.source === "remote") {
    return {
      key: `remote-${item.remoteTale.id}`,
      name: item.remoteTale.title,
      updatedAt: item.remoteTale.updatedAt,
      storageBytes: item.remoteTale.storageBytes ?? 0,
      item,
    };
  }
  if (!item.sync?.remoteTale) return null;
  return {
    key: `local-${item.localTale.id}`,
    name: item.localTale.name,
    updatedAt: item.sync.remoteTale.updatedAt,
    storageBytes: item.sync.remoteTale.storageBytes ?? 0,
    item,
  };
}

type CloudStorageItem = NonNullable<ReturnType<typeof cloudStorageItem>>;

export default function SettingsCloudSync() {
  const { t } = useLingui();
  const cloudBaseUrl = useSyncSettingsStore((state) => state.cloudBaseUrl);
  const defaultCloudUrl = defaultCloudBaseUrl();
  const personalBaseUrl = useSyncSettingsStore(
    (state) => state.personalBaseUrl,
  );
  const configuredSyncMode = useSyncSettingsStore(
    (state) => state.activeSyncMode,
  );
  const activeSyncMode = PERSONAL_SYNC_ENABLED ? configuredSyncMode : "hosted";
  const accessToken = useSyncSettingsStore((state) => state.accessToken);
  const accessTokenExpiresAt = useSyncSettingsStore(
    (state) => state.accessTokenExpiresAt,
  );
  const hasRefreshToken = useSyncSettingsStore(
    (state) => state.hasRefreshToken,
  );
  const hostedRefreshFailed = useSyncSettingsStore(
    (state) => state.hostedRefreshFailed,
  );
  const deviceId = useSyncSettingsStore((state) => state.deviceId);
  const accountId = useSyncSettingsStore((state) => state.accountId);
  const hostedDeviceIdsByAccountId = useSyncSettingsStore(
    (state) => state.hostedDeviceIdsByAccountId,
  );
  const deviceName = useSyncSettingsStore((state) => state.deviceName);
  const devicePlatform = useSyncSettingsStore((state) => state.devicePlatform);
  const accountDisplayName = useSyncSettingsStore(
    (state) => state.accountDisplayName,
  );
  const accountEmail = useSyncSettingsStore((state) => state.accountEmail);
  const setCloudBaseUrl = useSyncSettingsStore(
    (state) => state.setCloudBaseUrl,
  );
  const setPersonalBaseUrl = useSyncSettingsStore(
    (state) => state.setPersonalBaseUrl,
  );
  const setActiveSyncMode = useSyncSettingsStore(
    (state) => state.setActiveSyncMode,
  );
  const setAccessToken = useSyncSettingsStore((state) => state.setAccessToken);
  const setAccount = useSyncSettingsStore((state) => state.setAccount);
  const getOrCreateHostedDeviceId = useSyncSettingsStore(
    (state) => state.getOrCreateHostedDeviceId,
  );
  const clearSession = useSyncSettingsStore((state) => state.clearSession);
  const setDeviceName = useSyncSettingsStore((state) => state.setDeviceName);
  const setDevicePlatform = useSyncSettingsStore(
    (state) => state.setDevicePlatform,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [signInController, setSignInController] =
    useState<AbortController | null>(null);
  const signInControllerRef = useRef<AbortController | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [status, setStatus] = useState<string>("");
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [disabledReason, setDisabledReason] = useState<string | null>(null);
  const [undecidedTales, setUndecidedTales] = useState<UndecidedTale[]>([]);
  const [editingProfile, setEditingProfile] = useState(false);
  const { page, push: openPage, back: closePage } = useSettingsNavigation();
  const [accountUsage, setAccountUsage] = useState<HostedAccountUsage | null>(
    null,
  );
  const [usageError, setUsageError] = useState<unknown>(null);
  const [hostedDevices, setHostedDevices] = useState<SyncDevice[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(false);
  const [devicesError, setDevicesError] = useState<unknown>(null);
  const [removingCloudTale, setRemovingCloudTale] = useState<string | null>(
    null,
  );
  const [unregisteringDevice, setUnregisteringDevice] = useState<string | null>(
    null,
  );
  const taleLibrary = useTaleLibrary(1, 100);

  const hostedProfile = useMemo<SyncProfile>(
    () => ({
      id: HOSTED_PROFILE_ID,
      baseUrl: cloudBaseUrl.trim(),
      mode: "hosted",
      accountId: accountId || null,
      deviceId: accountId
        ? (hostedDeviceIdsByAccountId[accountId] ?? deviceId).trim()
        : deviceId.trim(),
    }),
    [accountId, cloudBaseUrl, deviceId, hostedDeviceIdsByAccountId],
  );
  const personalProfile = useMemo<SyncProfile>(
    () => ({
      id: PERSONAL_PROFILE_ID,
      baseUrl: personalBaseUrl.trim(),
      mode: "personal",
      deviceId: null,
    }),
    [personalBaseUrl],
  );
  const profile =
    activeSyncMode === "personal" ? personalProfile : hostedProfile;

  const tokenExpired =
    accessTokenExpiresAt !== null && accessTokenExpiresAt <= Date.now();
  const hasUsableToken = accessToken.trim().length > 0 && !tokenExpired;
  const canConnect =
    hostedProfile.baseUrl.length > 0 &&
    deviceName.trim().length > 0 &&
    devicePlatform.trim().length > 0;
  const accountLabel = accountDisplayName || accountEmail;
  const syncUiKind = getSyncUiKind({
    activeSyncMode,
    personalBaseUrl,
    accessToken,
    accessTokenExpiresAt,
    hasRefreshToken,
    accountLabel,
    syncEnabled,
    disabledReason,
    refreshFailed: hostedRefreshFailed,
  });
  const needsBrowserLogin =
    syncUiKind === "local" || syncUiKind === "sign-in-required";
  const needsProfileCompletion =
    activeSyncMode === "hosted" &&
    hasUsableToken &&
    !accountDisplayName &&
    busy === null;
  const canToggleActiveProfile =
    busy === null &&
    (profile.mode === "personal"
      ? profile.baseUrl.length > 0
      : canConnect && accountLabel.trim().length > 0);

  const hasAnySession = Boolean(accessToken || hasRefreshToken || accountLabel);
  const cloudConfigured = hostedProfile.baseUrl.length > 0;
  const showSyncControls = hasAnySession || activeSyncMode === "personal";
  const canReviewUndecidedTales =
    syncEnabled &&
    undecidedTales.length > 0 &&
    (syncUiKind === "signed-in" || syncUiKind === "personal");
  const showHostedUsage =
    activeSyncMode === "hosted" &&
    syncEnabled &&
    syncUiKind === "signed-in" &&
    hasUsableToken;
  const showHostedDevices =
    activeSyncMode === "hosted" &&
    hasUsableToken &&
    hostedProfile.baseUrl.length > 0 &&
    Boolean(accountLabel);
  const currentDeviceRegistered = hostedDevices.some(
    (device) => device.id === hostedProfile.deviceId,
  );
  const storageItems = useMemo(
    () =>
      taleLibrary.items
        .map(cloudStorageItem)
        .filter((item): item is CloudStorageItem => item !== null),
    [taleLibrary.items],
  );

  const refreshProfileState = useCallback(() => {
    void getSyncProfile(profile.id)
      .then((stored) => {
        setSyncEnabled(stored?.enabled === true);
        setDisabledReason(stored?.disabledReason ?? null);
      })
      .catch(() => undefined);
  }, [profile.id]);

  useEffect(() => {
    refreshProfileState();
    const removeListener = addSyncChangedListener(refreshProfileState);
    return removeListener;
  }, [refreshProfileState]);

  const refreshUndecidedTales = useCallback(
    async (
      profileId: string = profile.id,
      options: { open?: boolean; force?: boolean } = {},
    ) => {
      if (!options.force && (!syncEnabled || profile.baseUrl.length === 0)) {
        if (profileId === profile.id) setUndecidedTales([]);
        return [];
      }
      const tales = await listUndecidedTales(profileId, profile.accountId);
      if (profileId === profile.id || options.open) setUndecidedTales(tales);
      if (options.open && tales.length > 0) openPage("undecided");
      return tales;
    },
    [
      openPage,
      profile.accountId,
      profile.baseUrl.length,
      profile.id,
      syncEnabled,
    ],
  );

  useEffect(() => {
    void refreshUndecidedTales();
    const removeListener = addSyncChangedListener(() => {
      void refreshUndecidedTales();
    });
    return removeListener;
  }, [refreshUndecidedTales]);

  const refreshHostedUsage = useCallback(async () => {
    if (!showHostedUsage) {
      setAccountUsage(null);
      setUsageError(null);
      return;
    }
    try {
      setAccountUsage(
        await fetchHostedAccountUsage(
          createSyncTransport({
            profile: hostedProfile,
            accessToken: accessToken.trim(),
          }),
        ),
      );
      setUsageError(null);
    } catch (error) {
      setUsageError(error);
    }
  }, [accessToken, hostedProfile, showHostedUsage]);

  useEffect(() => {
    void refreshHostedUsage();
    const removeListener = addSyncChangedListener(() => {
      void refreshHostedUsage();
    });
    return removeListener;
  }, [refreshHostedUsage]);

  const refreshHostedDevices = useCallback(async () => {
    if (!showHostedDevices) {
      setHostedDevices([]);
      setDevicesError(null);
      return [];
    }
    setDevicesLoading(true);
    try {
      const devices = await listHostedDevices(
        createSyncTransport({
          profile: hostedProfile,
          accessToken: accessToken.trim(),
        }),
      );
      setHostedDevices(devices);
      setDevicesError(null);
      return devices;
    } catch (error) {
      setDevicesError(error);
      return [];
    } finally {
      setDevicesLoading(false);
    }
  }, [accessToken, hostedProfile, showHostedDevices]);

  useEffect(() => {
    void refreshHostedDevices();
  }, [refreshHostedDevices]);

  async function signInForToken() {
    signInControllerRef.current?.abort();
    const controller = new AbortController();
    signInControllerRef.current = controller;
    setSignInController(controller);
    try {
      const result = await signInHostedSync({
        profile: hostedProfile,
        signal: controller.signal,
      });
      if (controller.signal.aborted) throw new HostedSignInCancelledError();
      if (result.refreshToken) {
        await setHostedRefreshToken(HOSTED_PROFILE_ID, result.refreshToken);
      } else {
        await deleteHostedRefreshToken(HOSTED_PROFILE_ID);
      }
      if (controller.signal.aborted) throw new HostedSignInCancelledError();
      const expiresAt =
        result.expiresIn && result.expiresIn > 0
          ? Date.now() + result.expiresIn * 1000
          : null;
      setAccessToken(
        result.accessToken,
        expiresAt,
        Boolean(result.refreshToken),
      );
      return result.accessToken;
    } finally {
      if (signInControllerRef.current === controller) {
        signInControllerRef.current = null;
      }
      setSignInController((current) =>
        current === controller ? null : current,
      );
    }
  }

  useEffect(
    () => () => {
      signInControllerRef.current?.abort();
    },
    [],
  );

  function signOut() {
    signInControllerRef.current?.abort();
    void deleteHostedRefreshToken(HOSTED_PROFILE_ID).catch(() => undefined);
    clearSession();
    void setSyncProfileDisabled(HOSTED_PROFILE_ID, "signed_out").catch(
      () => undefined,
    );
    if (profile.mode === "hosted") {
      setSyncEnabled(false);
      setDisabledReason("signed_out");
    }
    setStatus(t`Signed out`);
    notifySyncChanged();
  }

  function changeHostedCloudUrl(nextUrl: string) {
    if (nextUrl === cloudBaseUrl) return;
    signInControllerRef.current?.abort();
    void deleteHostedRefreshToken(HOSTED_PROFILE_ID).catch(() => undefined);
    if (hasAnySession) {
      clearSession();
      void setSyncProfileDisabled(HOSTED_PROFILE_ID, "signed_out").catch(
        () => undefined,
      );
      setStatus(t`Cloud URL changed. Sign in again to continue.`);
      notifySyncChanged();
    }
    setCloudBaseUrl(nextUrl);
  }

  async function completeProfile() {
    const displayName = profileDisplayName.trim();
    if (!displayName) return;
    setProfileBusy(true);
    setStatus(t`Saving profile`);
    try {
      const account = await withTimeout(
        updateHostedAccountProfile(
          createSyncTransport({
            profile: hostedProfile,
            accessToken: accessToken.trim(),
          }),
          { displayName },
        ),
        PROFILE_UPDATE_TIMEOUT_MS,
      );
      setAccount({
        id: account.id,
        displayName: account.displayName,
        email: account.emailNormalized,
      });
      setStatus(t`Profile completed`);
      toast.success(t`Profile completed`);
      setEditingProfile(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : t`Sync failed`;
      setStatus(message);
      toast.error(message);
    } finally {
      setProfileBusy(false);
    }
  }

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    try {
      await action();
    } catch (error) {
      if (isHostedSignInCancelledError(error)) {
        setStatus("");
        return;
      }
      const message = error instanceof Error ? error.message : t`Sync failed`;
      if (message.toLowerCase().includes("device limit")) {
        setSyncEnabled(false);
        setDisabledReason("device_limit");
      }
      setStatus(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  }

  async function prepareHostedConnection() {
    const token = hasUsableToken ? accessToken.trim() : await signInForToken();
    const controller = new AbortController();
    signInControllerRef.current?.abort();
    signInControllerRef.current = controller;
    try {
      const appVersion = await getVersion().catch(
        () => HAKAWATI_CLIENT_VERSION,
      );
      const result = await prepareHostedSync({
        profile: hostedProfile,
        accessToken: token,
        signal: controller.signal,
        device: {
          name: deviceName.trim(),
          platform: devicePlatform.trim(),
          appVersion,
        },
        getDeviceIdForAccount: getOrCreateHostedDeviceId,
      });
      if (controller.signal.aborted) throw new HostedSignInCancelledError();
      return result;
    } catch (error) {
      if (controller.signal.aborted) throw new HostedSignInCancelledError();
      throw error;
    } finally {
      if (signInControllerRef.current === controller)
        signInControllerRef.current = null;
    }
  }

  async function connect() {
    await run("connect", async () => {
      const result = await prepareHostedConnection();
      const label =
        result.account.emailNormalized ??
        result.account.displayName ??
        result.account.id;
      setAccount({
        id: result.account.id,
        displayName: result.account.displayName,
        email: result.account.emailNormalized,
      });
      setSyncEnabled(Boolean(result.device));
      setDisabledReason(result.device ? null : "device_limit");
      setActiveSyncMode("hosted");
      if (!result.device) {
        setStatus(
          t`This device is not syncing because the device limit was reached`,
        );
        notifySyncChanged();
        return;
      }
      setStatus(t`Connected as ${label}`);
      wakeSyncBackground();
      notifySyncChanged();
      await refreshUndecidedTales(HOSTED_PROFILE_ID, {
        open: true,
        force: true,
      });
      toast.success(t`Cloud sync connected`);
    });
  }

  async function toggleSync() {
    if (syncEnabled) {
      await run("disable", async () => {
        await setSyncProfileDisabled(profile.id, "user_disabled");
        setSyncEnabled(false);
        setDisabledReason("user_disabled");
        setUndecidedTales([]);
        if (page === "undecided") closePage();
        setStatus("");
        notifySyncChanged();
      });
      return;
    }
    await run("enable", async () => {
      if (profile.mode === "personal") {
        await fetchSyncCapabilities(createSyncTransport({ profile }));
        await upsertSyncProfile({
          ...profile,
          enabled: true,
          disabledReason: null,
        });
        setSyncEnabled(true);
        setDisabledReason(null);
        setStatus("");
        wakeSyncBackground();
        notifySyncChanged();
        await refreshUndecidedTales(profile.id, { open: true, force: true });
        return;
      }
      const result = await prepareHostedConnection();
      setAccount({
        id: result.account.id,
        displayName: result.account.displayName,
        email: result.account.emailNormalized,
      });
      if (!result.device) {
        setSyncEnabled(false);
        setDisabledReason("device_limit");
        setStatus(
          t`This device is not syncing because the device limit was reached`,
        );
        notifySyncChanged();
        return;
      }
      setSyncEnabled(true);
      setDisabledReason(null);
      setStatus("");
      wakeSyncBackground();
      notifySyncChanged();
      await refreshUndecidedTales(HOSTED_PROFILE_ID, {
        open: true,
        force: true,
      });
    });
  }

  async function connectPersonal() {
    await run("personal", async () => {
      await fetchSyncCapabilities(
        createSyncTransport({ profile: personalProfile }),
      );
      await upsertSyncProfile({
        ...personalProfile,
        enabled: true,
        disabledReason: null,
      });
      setActiveSyncMode("personal");
      setSyncEnabled(true);
      setDisabledReason(null);
      setStatus(t`Personal sync connected`);
      wakeSyncBackground();
      notifySyncChanged();
      await refreshUndecidedTales(PERSONAL_PROFILE_ID, {
        open: true,
        force: true,
      });
    });
  }

  async function decideOne(taleId: string, policy: "sync" | "private") {
    await run(`${policy}-${taleId}`, async () => {
      await decideTaleSyncPreference(
        profile.id,
        profile.accountId,
        taleId,
        policy,
      );
      const remaining = await refreshUndecidedTales();
      if (remaining.length === 0) closePage();
      notifySyncChanged();
    });
  }

  async function decideAll(policy: "sync" | "private") {
    await run(`${policy}-all`, async () => {
      const ids = undecidedTales.map((tale) => tale.id);
      await decideAllTaleSyncPreferences(
        profile.id,
        profile.accountId,
        ids,
        policy,
      );
      setUndecidedTales([]);
      closePage();
      notifySyncChanged();
    });
  }

  async function removeCloudStorageItem(item: CloudStorageItem) {
    setRemovingCloudTale(item.key);
    try {
      await taleLibrary.removeLibraryTaleFromCloud(item.item);
      await refreshHostedUsage();
      toast.success(t`Removed from cloud`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t`Failed to remove from cloud`,
      );
    } finally {
      setRemovingCloudTale(null);
    }
  }

  async function registerCurrentDeviceAfterFreeSlot() {
    if (!canConnect || !hasUsableToken || !hostedProfile.deviceId) {
      return false;
    }
    const transport = createSyncTransport({
      profile: hostedProfile,
      accessToken: accessToken.trim(),
    });
    const appVersion = await getVersion().catch(() => HAKAWATI_CLIENT_VERSION);
    await registerSyncDevice(transport, {
      id: hostedProfile.deviceId,
      name: deviceName.trim(),
      platform: devicePlatform.trim(),
      appVersion,
    });
    await upsertSyncProfile({
      ...hostedProfile,
      enabled: true,
      disabledReason: null,
    });
    setSyncEnabled(true);
    setDisabledReason(null);
    setStatus(t`Cloud sync connected`);
    wakeSyncBackground();
    notifySyncChanged();
    return true;
  }

  async function unregisterDevice(device: SyncDevice) {
    if (device.id === hostedProfile.deviceId) return;
    setUnregisteringDevice(device.id);
    try {
      const transport = createSyncTransport({
        profile: hostedProfile,
        accessToken: accessToken.trim(),
      });
      await unregisterHostedDevice(transport, device.id);
      const devices = await listHostedDevices(transport);
      setHostedDevices(devices);
      setDevicesError(null);
      if (!devices.some((item) => item.id === hostedProfile.deviceId)) {
        await registerCurrentDeviceAfterFreeSlot();
        setHostedDevices(await listHostedDevices(transport));
      }
      toast.success(t`Device unregistered`);
    } catch (error) {
      setDevicesError(error);
      toast.error(
        error instanceof Error ? error.message : t`Failed to update devices`,
      );
    } finally {
      setUnregisteringDevice(null);
    }
  }

  const syncState: { text: string; className?: string } =
    syncUiKind === "signed-in"
      ? { text: t`On for this device`, className: "text-success" }
      : syncUiKind === "reconnecting"
        ? { text: t`Reconnecting…` }
        : syncUiKind === "device-limit"
          ? { text: t`Device limit reached`, className: "text-destructive" }
          : syncUiKind === "sign-in-required"
            ? { text: t`Sign in again to sync`, className: "text-destructive" }
            : syncUiKind === "profile-incomplete"
              ? { text: t`Profile incomplete` }
              : syncUiKind === "personal"
                ? { text: t`Personal` }
                : syncUiKind === "local"
                  ? { text: t`Sign in to sync` }
                  : { text: t`Off for this device` };
  const statusLine = status ? (
    <p className="px-0.5 text-sm text-muted-foreground">{status}</p>
  ) : null;

  let content: ReactNode;
  if (page === "undecided") {
    content = (
      <UndecidedTales
        tales={undecidedTales}
        busy={busy !== null}
        onDecide={(taleId, policy) => void decideOne(taleId, policy)}
        onDecideAll={(policy) => void decideAll(policy)}
      />
    );
  } else if (page === "storage") {
    content = (
      <CloudTales
        usage={accountUsage}
        items={storageItems}
        loading={taleLibrary.remoteLoading}
        unavailable={Boolean(taleLibrary.remoteError)}
        removing={removingCloudTale !== null}
        onRemove={(item) => void removeCloudStorageItem(item)}
      />
    );
  } else if (page === "devices") {
    content = (
      <Devices
        devices={hostedDevices}
        loading={devicesLoading}
        unavailable={Boolean(devicesError)}
        currentId={hostedProfile.deviceId}
        currentRegistered={currentDeviceRegistered}
        unregistering={unregisteringDevice !== null}
        onUnregister={(device) => void unregisterDevice(device)}
      />
    );
  } else if (page === "service") {
    content = (
      <div className="flex flex-col gap-6">
        <SetupSection title={<Trans>Cloud URL</Trans>}>
          <div className="flex flex-wrap gap-2">
            <Input
              className="h-11 min-w-0 flex-1 basis-48"
              value={cloudBaseUrl}
              onChange={(event) => changeHostedCloudUrl(event.target.value)}
              placeholder={t`https://sync.example.com`}
              aria-label={t`Cloud URL`}
            />
            <Button
              type="button"
              variant="outline"
              className="h-11"
              disabled={busy !== null || cloudBaseUrl === defaultCloudUrl}
              onClick={() => changeHostedCloudUrl(defaultCloudUrl)}
            >
              <Trans>Reset to Default</Trans>
            </Button>
          </div>
        </SetupSection>
        <SetupSection title={<Trans>Device name</Trans>}>
          <Input
            className="h-11"
            value={deviceName}
            onChange={(event) => setDeviceName(event.target.value)}
            aria-label={t`Device name`}
          />
        </SetupSection>
        <SetupSection title={<Trans>Platform</Trans>}>
          <Input
            className="h-11"
            value={devicePlatform}
            onChange={(event) => setDevicePlatform(event.target.value)}
            aria-label={t`Platform`}
          />
        </SetupSection>
        {PERSONAL_SYNC_ENABLED ? (
          <SetupSection title={<Trans>Personal sync server</Trans>}>
            <div className="flex flex-wrap gap-2">
              <Input
                className="h-11 min-w-0 flex-1 basis-48"
                value={personalBaseUrl}
                onChange={(event) => setPersonalBaseUrl(event.target.value)}
                placeholder={t`http://192.168.1.20:8787`}
                aria-label={t`Personal Sync URL`}
              />
              <Button
                variant="outline"
                className="h-11"
                onClick={connectPersonal}
                disabled={!personalProfile.baseUrl || busy !== null}
              >
                <Trans>Connect Personal Sync</Trans>
              </Button>
            </div>
          </SetupSection>
        ) : null}
        {statusLine}
      </div>
    );
  } else {
    const signedOut = syncUiKind === "local";
    const talesUsed = accountUsage?.tales.used ?? 0;
    const talesLimit = accountUsage?.tales.limit ?? 0;
    const storageUsed = formatMegabytes(accountUsage?.storage.usedBytes ?? 0);
    const storageLimit = formatMegabytes(accountUsage?.storage.limitBytes ?? 0);
    const usageLine =
      showHostedUsage && accountUsage
        ? t`${talesUsed} of ${talesLimit} tales · ${storageUsed} of ${storageLimit}`
        : showHostedUsage && usageError
          ? t`Storage usage is unavailable.`
          : null;
    const localTales = taleLibrary.total ?? 0;
    content = (
      <div className="flex flex-col gap-6">
        <div className="flex items-center gap-3.5 px-0.5">
          <Avatar
            className={cn(
              "size-14 border",
              signedOut ? "border-border" : "border-primary/45",
            )}
          >
            <AvatarFallback
              className={cn(
                "text-lg font-bold",
                signedOut
                  ? "bg-card text-muted-foreground"
                  : "bg-primary/15 text-primary",
              )}
            >
              {signedOut ? (
                <UserRound className="size-6" />
              ) : syncUiKind === "reconnecting" ? (
                <Cloud className="size-5 animate-pulse" />
              ) : accountLabel ? (
                avatarInitial(accountLabel)
              ) : (
                <Cloud className="size-5" />
              )}
            </AvatarFallback>
          </Avatar>
          <div className="flex min-w-0 flex-1 flex-col gap-0.5">
            <span className="truncate text-base font-semibold">
              {signedOut ? (
                <Trans>Not signed in</Trans>
              ) : (
                accountLabel ||
                (syncUiKind === "personal" ? (
                  <Trans>Personal Sync</Trans>
                ) : (
                  <Trans>Your account</Trans>
                ))
              )}
            </span>
            {accountDisplayName && accountEmail ? (
              <span className="truncate text-sm text-muted-foreground">
                {accountEmail}
              </span>
            ) : null}
          </div>
          {signedOut ? (
            <Button onClick={connect} disabled={!canConnect || busy !== null}>
              <Trans>Sign in</Trans>
            </Button>
          ) : hasUsableToken && accountDisplayName ? (
            <Button
              variant="outline"
              disabled={busy !== null}
              onClick={() => {
                setProfileDisplayName(accountDisplayName);
                setEditingProfile(true);
              }}
            >
              <Trans>Edit</Trans>
            </Button>
          ) : null}
        </div>

        {needsBrowserLogin && !signedOut ? (
          <StatusBanner
            tone="destructive"
            title={<Trans>Sign in again to keep syncing</Trans>}
            action={
              <Button
                size="sm"
                onClick={connect}
                disabled={!canConnect || busy !== null}
              >
                <Trans>Sign in</Trans>
              </Button>
            }
          />
        ) : null}
        {!cloudConfigured ? (
          <StatusBanner
            tone="destructive"
            title={<Trans>Cloud service is not configured</Trans>}
          />
        ) : null}

        {showSyncControls || signedOut ? (
          <SetupList>
            <PlainRow>
              <RowText
                title={<Trans>Cloud sync</Trans>}
                detail={
                  <>
                    <span className={cn("block", syncState.className)}>
                      {syncState.text}
                    </span>
                    {usageLine ? (
                      <span className="block">{usageLine}</span>
                    ) : null}
                  </>
                }
              />
              <ToggleSwitch
                checked={syncEnabled && !signedOut}
                onCheckedChange={() => void toggleSync()}
                disabled={signedOut || !canToggleActiveProfile}
                label={t`Cloud sync`}
              />
            </PlainRow>
          </SetupList>
        ) : null}
        {signedOut && localTales > 0 ? (
          <p className="-mt-2 px-0.5 text-sm text-muted-foreground">
            {plural(localTales, {
              one: "Your tale is only on this device.",
              other: "Your # tales are only on this device.",
            })}
          </p>
        ) : null}

        {canReviewUndecidedTales || showHostedUsage || showHostedDevices ? (
          <SetupList>
            {canReviewUndecidedTales ? (
              <LinkRow
                title={<Trans>Tales waiting for a choice</Trans>}
                trailing={
                  <span className="flex h-6 min-w-6 shrink-0 items-center justify-center rounded-xs bg-primary px-1.5 text-[0.8rem] font-bold text-primary-foreground">
                    {undecidedTales.length}
                  </span>
                }
                disabled={busy !== null}
                onClick={() => openPage("undecided")}
              />
            ) : null}
            {showHostedUsage ? (
              <LinkRow
                title={<Trans>Tales in the cloud</Trans>}
                onClick={() => openPage("storage")}
              />
            ) : null}
            {showHostedDevices ? (
              <LinkRow
                title={<Trans>Devices</Trans>}
                trailing={
                  devicesLoading && hostedDevices.length === 0 ? null : (
                    <RowValue>
                      <UsageCount
                        used={hostedDevices.length}
                        limit={HOSTED_DEVICE_LIMIT}
                      />
                    </RowValue>
                  )
                }
                onClick={() => openPage("devices")}
              />
            ) : null}
          </SetupList>
        ) : null}

        {hasAnySession ? (
          <button
            type="button"
            onClick={signOut}
            className="flex min-h-13 items-center rounded-xs border border-border/70 bg-background/60 px-3.5 text-start text-sm font-medium text-destructive transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none"
          >
            <Trans>Sign out</Trans>
          </button>
        ) : null}
        {statusLine}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {content}
      {page === null ? (
        <button
          type="button"
          onClick={() => openPage("service")}
          className="self-center px-2 py-1 text-[0.8rem] text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
        >
          <Trans>Cloud service settings</Trans>
        </button>
      ) : null}

      <Dialog
        open={Boolean(signInController)}
        onOpenChange={(open) => {
          if (!open) signInController?.abort();
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              <Trans>Connecting...</Trans>
            </DialogTitle>
            <DialogDescription>
              <Trans>
                Finish signing in through your browser. You can cancel and keep
                using Hakawati at any time.
              </Trans>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => signInController?.abort()}>
              <Trans>Cancel</Trans>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={needsProfileCompletion || editingProfile}
        onOpenChange={(open) => {
          if (!open) setEditingProfile(false);
        }}
      >
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              {needsProfileCompletion ? (
                <Trans>Complete your profile</Trans>
              ) : (
                <Trans>Edit profile</Trans>
              )}
            </DialogTitle>
            <DialogDescription>
              <Trans>
                Choose the name shown on this device and in sync settings.
              </Trans>
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="sync-display-name">
              <Trans>Display name</Trans>
            </Label>
            <Input
              id="sync-display-name"
              value={profileDisplayName}
              onChange={(event) => setProfileDisplayName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void completeProfile();
              }}
              autoFocus
            />
          </div>
          <DialogFooter>
            {needsProfileCompletion ? null : (
              <Button
                variant="outline"
                onClick={() => setEditingProfile(false)}
                disabled={profileBusy}
              >
                <Trans>Cancel</Trans>
              </Button>
            )}
            <Button
              onClick={completeProfile}
              disabled={profileBusy || profileDisplayName.trim().length === 0}
            >
              {needsProfileCompletion ? (
                <Trans>Continue</Trans>
              ) : (
                <Trans>Save</Trans>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** Heads Account & Sync's subpages in the settings header. */
export function CloudSyncTitle({ page }: { page: string }) {
  switch (page) {
    case "undecided":
      return <Trans>Tales waiting for a choice</Trans>;
    case "storage":
      return <Trans>Tales in the cloud</Trans>;
    case "devices":
      return <Trans>Devices</Trans>;
    case "service":
      return <Trans>Cloud service</Trans>;
    default:
      return <Trans>Account & Sync</Trans>;
  }
}

function RowValue({ children }: { children: ReactNode }) {
  return (
    <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
      {children}
    </span>
  );
}

function UsageCount({
  used,
  limit,
}: {
  used: number | string;
  limit: number | string;
}) {
  const { t } = useLingui();
  return <>{t`${used} of ${limit}`}</>;
}

function UsageBar({
  label,
  used,
  limit,
  percent,
  ariaLabel,
}: {
  label: ReactNode;
  used: number | string;
  limit: number | string;
  percent: number;
  ariaLabel: string;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span>{label}</span>
        <span className="shrink-0 tabular-nums text-muted-foreground">
          <UsageCount used={used} limit={limit} />
        </span>
      </div>
      <Progress aria-label={ariaLabel} value={percent} />
    </div>
  );
}

function UsageBars({ usage }: { usage: HostedAccountUsage }) {
  const { t } = useLingui();
  const talesUsed = usage.tales.used;
  const talesLimit = usage.tales.limit;
  const storageUsed = formatMegabytes(usage.storage.usedBytes);
  const storageLimit = formatMegabytes(usage.storage.limitBytes);
  return (
    <>
      <UsageBar
        label={<Trans>Tales</Trans>}
        used={talesUsed}
        limit={talesLimit}
        percent={usagePercent(talesUsed, talesLimit)}
        ariaLabel={t`Tale usage`}
      />
      <UsageBar
        label={<Trans>Storage</Trans>}
        used={storageUsed}
        limit={storageLimit}
        percent={usagePercent(
          usage.storage.usedBytes,
          usage.storage.limitBytes,
        )}
        ariaLabel={t`Storage usage`}
      />
    </>
  );
}

const itemRowClass =
  "flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-border/60 px-3.5 py-2.5 last:border-b-0";

function UndecidedTales({
  tales,
  busy,
  onDecide,
  onDecideAll,
}: {
  tales: UndecidedTale[];
  busy: boolean;
  onDecide: (taleId: string, policy: "sync" | "private") => void;
  onDecideAll: (policy: "sync" | "private") => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <SetupList>
        {tales.map((tale) => (
          <div key={tale.id} className={itemRowClass}>
            <RowText
              title={tale.name}
              detail={tale.description || formatExactDateTime(tale.updatedAt)}
            />
            <div className="flex shrink-0 gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => onDecide(tale.id, "private")}
                disabled={busy}
              >
                <Trans>Private</Trans>
              </Button>
              <Button
                size="sm"
                onClick={() => onDecide(tale.id, "sync")}
                disabled={busy}
              >
                <Trans>Sync</Trans>
              </Button>
            </div>
          </div>
        ))}
        {tales.length === 0 ? (
          <PlainRow className="text-sm text-muted-foreground">
            <Trans>No tales waiting.</Trans>
          </PlainRow>
        ) : null}
      </SetupList>
      {tales.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={() => onDecideAll("private")}
            disabled={busy}
          >
            <Trans>Keep all private</Trans>
          </Button>
          <Button onClick={() => onDecideAll("sync")} disabled={busy}>
            <Trans>Sync all</Trans>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function CloudTales({
  usage,
  items,
  loading,
  unavailable,
  removing,
  onRemove,
}: {
  usage: HostedAccountUsage | null;
  items: CloudStorageItem[];
  loading: boolean;
  unavailable: boolean;
  removing: boolean;
  onRemove: (item: CloudStorageItem) => void;
}) {
  return (
    <div className="flex flex-col gap-6">
      {usage ? (
        <div className="flex flex-col gap-3 rounded-xs border border-border/70 bg-background/60 p-3.5">
          <UsageBars usage={usage} />
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <SetupList>
          {items.map((item) => (
            <div key={item.key} className={itemRowClass}>
              <RowText
                title={item.name}
                detail={`${formatBytes(item.storageBytes)} · ${formatExactDateTime(item.updatedAt)}`}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => onRemove(item)}
                disabled={removing}
              >
                <Trans>Remove from cloud</Trans>
              </Button>
            </div>
          ))}
          {loading ? (
            <PlainRow className="text-sm text-muted-foreground">
              <Trans>Loading...</Trans>
            </PlainRow>
          ) : items.length === 0 ? (
            <PlainRow className="text-sm text-muted-foreground">
              <Trans>No cloud tales.</Trans>
            </PlainRow>
          ) : null}
        </SetupList>
        {unavailable ? (
          <p className="px-0.5 text-sm text-muted-foreground">
            <Trans>Cloud tales are unavailable.</Trans>
          </p>
        ) : null}
        <p className="px-0.5 text-sm text-muted-foreground">
          <Trans>
            Tales on this device stay here when you remove their cloud copy.
          </Trans>
        </p>
      </div>
    </div>
  );
}

function Devices({
  devices,
  loading,
  unavailable,
  currentId,
  currentRegistered,
  unregistering,
  onUnregister,
}: {
  devices: SyncDevice[];
  loading: boolean;
  unavailable: boolean;
  currentId: string | null | undefined;
  currentRegistered: boolean;
  unregistering: boolean;
  onUnregister: (device: SyncDevice) => void;
}) {
  const { t } = useLingui();
  const count = devices.length;
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2 rounded-xs border border-border/70 bg-background/60 p-3.5">
        <UsageBar
          label={<Trans>Devices</Trans>}
          used={count}
          limit={HOSTED_DEVICE_LIMIT}
          percent={usagePercent(count, HOSTED_DEVICE_LIMIT)}
          ariaLabel={t`Device usage`}
        />
        {!loading && !currentRegistered ? (
          <p className="text-sm text-muted-foreground">
            <Trans>This device is not registered.</Trans>
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-2">
        <SetupList>
          {devices.map((device) => {
            const isCurrent = device.id === currentId;
            const lastSeen = formatExactDateTime(device.lastSeenAt);
            return (
              <div key={device.id} className={itemRowClass}>
                <RowText
                  title={
                    <>
                      {device.name}
                      {isCurrent ? (
                        <span className="ms-2 text-[0.75rem] font-normal text-primary">
                          <Trans>This device</Trans>
                        </span>
                      ) : null}
                    </>
                  }
                  detail={`${device.platform} · ${device.appVersion} · ${t`Last seen ${lastSeen}`}`}
                />
                {isCurrent ? null : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onUnregister(device)}
                    disabled={unregistering}
                  >
                    <Trans>Unregister</Trans>
                  </Button>
                )}
              </div>
            );
          })}
          {loading ? (
            <PlainRow className="text-sm text-muted-foreground">
              <Trans>Loading...</Trans>
            </PlainRow>
          ) : devices.length === 0 ? (
            <PlainRow className="text-sm text-muted-foreground">
              <Trans>No registered devices.</Trans>
            </PlainRow>
          ) : null}
        </SetupList>
        {unavailable ? (
          <p className="px-0.5 text-sm text-muted-foreground">
            <Trans>Devices are unavailable.</Trans>
          </p>
        ) : null}
      </div>
    </div>
  );
}

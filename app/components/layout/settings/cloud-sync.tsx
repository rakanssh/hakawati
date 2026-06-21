import { useEffect, useMemo, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Cloud, LogOut, Power, Upload } from "lucide-react";
import { toast } from "sonner";
import { Trans, useLingui } from "@lingui/react/macro";
import { Badge } from "@/components/ui/badge";
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
import {
  SettingsField,
  SettingsPanel,
  SettingsStack,
} from "@/components/layout/settings/settings-layout";
import { useSyncSettingsStore } from "@/store";
import {
  getSyncProfile,
  listTaleSyncPreferences,
  listTaleSyncStates,
  setSyncProfileDisabled,
  setTaleSyncPreference,
  upsertSyncProfile,
} from "@/repositories/sync.repository";
import { getAllTales } from "@/services/tale.service";
import {
  createSyncTransport,
  prepareHostedSync,
  fetchSyncCapabilities,
  signInHostedSync,
  updateHostedAccountProfile,
  uploadTalePackage,
  type SyncProfile,
} from "@/services/sync";
import { notifySyncChanged, wakeSyncBackground } from "@/services/sync-wakeup";

const HOSTED_PROFILE_ID = "hosted";
const PERSONAL_PROFILE_ID = "personal";
const PROFILE_UPDATE_TIMEOUT_MS = 15_000;

function idempotencyKey() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`;
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

export default function SettingsCloudSync() {
  const { t } = useLingui();
  const cloudBaseUrl = useSyncSettingsStore((state) => state.cloudBaseUrl);
  const personalBaseUrl = useSyncSettingsStore(
    (state) => state.personalBaseUrl,
  );
  const activeSyncMode = useSyncSettingsStore((state) => state.activeSyncMode);
  const accessToken = useSyncSettingsStore((state) => state.accessToken);
  const accessTokenExpiresAt = useSyncSettingsStore(
    (state) => state.accessTokenExpiresAt,
  );
  const deviceId = useSyncSettingsStore((state) => state.deviceId);
  const deviceName = useSyncSettingsStore((state) => state.deviceName);
  const devicePlatform = useSyncSettingsStore((state) => state.devicePlatform);
  const accountDisplayName = useSyncSettingsStore(
    (state) => state.accountDisplayName,
  );
  const accountEmail = useSyncSettingsStore((state) => state.accountEmail);
  const accountEmailVerified = useSyncSettingsStore(
    (state) => state.accountEmailVerified,
  );
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
  const clearSession = useSyncSettingsStore((state) => state.clearSession);
  const setDeviceName = useSyncSettingsStore((state) => state.setDeviceName);
  const setDevicePlatform = useSyncSettingsStore(
    (state) => state.setDevicePlatform,
  );
  const showSyncAllPrompt = useSyncSettingsStore(
    (state) => state.showSyncAllPrompt,
  );
  const syncAllPromptAnswered = useSyncSettingsStore(
    (state) => state.syncAllPromptAnswered,
  );
  const setShowSyncAllPrompt = useSyncSettingsStore(
    (state) => state.setShowSyncAllPrompt,
  );
  const setSyncAllPromptAnswered = useSyncSettingsStore(
    (state) => state.setSyncAllPromptAnswered,
  );
  const [busy, setBusy] = useState<string | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [status, setStatus] = useState<string>("");
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [disabledReason, setDisabledReason] = useState<string | null>(null);

  const hostedProfile = useMemo<SyncProfile>(
    () => ({
      id: HOSTED_PROFILE_ID,
      baseUrl: cloudBaseUrl.trim(),
      mode: "hosted",
      deviceId: deviceId.trim(),
    }),
    [cloudBaseUrl, deviceId],
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

  const tokenStatus =
    tokenExpired && accessToken.trim().length > 0
      ? t`Session expired. Connect again.`
      : "";

  useEffect(() => {
    getSyncProfile(profile.id)
      .then((stored) => {
        setSyncEnabled(stored?.enabled === true);
        setDisabledReason(stored?.disabledReason ?? null);
      })
      .catch(() => undefined);
  }, [profile.id]);

  async function signInForToken() {
    const result = await signInHostedSync({ profile: hostedProfile });
    const expiresAt =
      result.expiresIn && result.expiresIn > 0
        ? Date.now() + result.expiresIn * 1000
        : null;
    setAccessToken(result.accessToken, expiresAt);
    return result.accessToken;
  }

  function transport() {
    return createSyncTransport({
      profile,
      accessToken: profile.mode === "hosted" ? accessToken.trim() : undefined,
    });
  }

  function signOut() {
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
        displayName: account.displayName,
        email: account.emailNormalized,
        emailVerified: account.emailVerified,
      });
      setStatus(t`Profile completed`);
      toast.success(t`Profile completed`);
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

  async function connect() {
    await run("connect", async () => {
      const token = hasUsableToken
        ? accessToken.trim()
        : await signInForToken();
      const appVersion = await getVersion().catch(() => "0.15.0");
      const result = await prepareHostedSync({
        profile: hostedProfile,
        accessToken: token,
        device: {
          id: deviceId.trim(),
          name: deviceName.trim(),
          platform: devicePlatform.trim(),
          appVersion,
        },
      });
      const label =
        result.account.emailNormalized ??
        result.account.displayName ??
        result.account.id;
      setAccount({
        displayName: result.account.displayName,
        email: result.account.emailNormalized,
        emailVerified: result.account.emailVerified,
      });
      setSyncEnabled(Boolean(result.device));
      setDisabledReason(result.device ? null : "device_limit");
      setShowSyncAllPrompt(Boolean(result.device) && !syncAllPromptAnswered);
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
      toast.success(t`Cloud sync connected`);
    });
  }

  async function toggleSync() {
    if (syncEnabled) {
      await run("disable", async () => {
        await setSyncProfileDisabled(profile.id, "user_disabled");
        setSyncEnabled(false);
        setDisabledReason("user_disabled");
        setStatus(t`Sync is off on this device`);
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
        setStatus(t`Sync is on`);
        wakeSyncBackground();
        notifySyncChanged();
        return;
      }
      const token = hasUsableToken
        ? accessToken.trim()
        : await signInForToken();
      const appVersion = await getVersion().catch(() => "0.15.0");
      const result = await prepareHostedSync({
        profile: hostedProfile,
        accessToken: token,
        device: {
          id: deviceId.trim(),
          name: deviceName.trim(),
          platform: devicePlatform.trim(),
          appVersion,
        },
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
      setStatus(t`Sync is on`);
      wakeSyncBackground();
      notifySyncChanged();
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
      setShowSyncAllPrompt(!syncAllPromptAnswered);
      setStatus(t`Personal sync connected`);
      wakeSyncBackground();
      notifySyncChanged();
    });
  }

  async function loadAllLocalTales() {
    const first = await getAllTales(1, 100);
    const pages = [first];
    for (let page = 2; (page - 1) * 100 < first.total; page += 1) {
      pages.push(await getAllTales(page, 100));
    }
    return pages.flatMap((page) => page.data);
  }

  async function syncAllLocalTales() {
    await run("sync-all", async () => {
      const tales = await loadAllLocalTales();
      const privateTaleIds = new Set(
        (await listTaleSyncPreferences(profile.id))
          .filter((preference) => preference.policy === "private")
          .map((preference) => preference.localTaleId),
      );
      const linkedLocalTaleIds = new Set(
        (await listTaleSyncStates(profile.id)).map(
          (state) => state.localTaleId,
        ),
      );
      let failed = 0;
      const syncableTales = tales.filter(
        (tale) =>
          !privateTaleIds.has(tale.id) && !linkedLocalTaleIds.has(tale.id),
      );
      for (const tale of syncableTales) {
        try {
          await setTaleSyncPreference({
            profileId: profile.id,
            localTaleId: tale.id,
            policy: "sync",
          });
          await uploadTalePackage({
            profile,
            transport: transport(),
            localTaleId: tale.id,
            idempotencyKey: idempotencyKey(),
          });
        } catch {
          failed += 1;
        }
      }
      setSyncAllPromptAnswered(true);
      setShowSyncAllPrompt(false);
      const message =
        syncableTales.length === 0
          ? t`No local tales to sync.`
          : failed > 0
            ? t`Synced ${syncableTales.length - failed} tales. ${failed} failed.`
            : t`Synced ${syncableTales.length} tales.`;
      setStatus(message);
      notifySyncChanged();
      toast.success(message);
    });
  }

  async function keepExistingLocalPrivate() {
    await run("keep-private", async () => {
      const tales = await loadAllLocalTales();
      await Promise.all(
        tales.map((tale) =>
          setTaleSyncPreference({
            profileId: profile.id,
            localTaleId: tale.id,
            policy: "private",
          }),
        ),
      );
      setSyncAllPromptAnswered(true);
      setShowSyncAllPrompt(false);
      setStatus(t`Existing local tales will stay private`);
      notifySyncChanged();
    });
  }

  return (
    <SettingsStack>
      <SettingsPanel
        title={
          <span className="inline-flex items-center gap-2">
            <Cloud className="size-4" />
            <Trans>Cloud Sync</Trans>
          </span>
        }
      >
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SettingsField label={<Trans>Cloud URL</Trans>}>
            <Input
              value={cloudBaseUrl}
              onChange={(event) => setCloudBaseUrl(event.target.value)}
              placeholder={t`https://sync.example.com`}
            />
          </SettingsField>
          <SettingsField label={<Trans>Device Name</Trans>}>
            <Input
              value={deviceName}
              onChange={(event) => setDeviceName(event.target.value)}
            />
          </SettingsField>
          <SettingsField label={<Trans>Platform</Trans>}>
            <Input
              value={devicePlatform}
              onChange={(event) => setDevicePlatform(event.target.value)}
            />
          </SettingsField>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={connect}
            disabled={!canConnect || busy !== null}
          >
            <Cloud className="size-4" />
            {hasUsableToken ? (
              <Trans>Reconnect sync</Trans>
            ) : (
              <Trans>Log in / Sign up</Trans>
            )}
          </Button>
          <Button
            variant="outline"
            onClick={signOut}
            disabled={!accessToken && !accountLabel}
          >
            <LogOut className="size-4" />
            <Trans>Sign out</Trans>
          </Button>
          <Badge variant="outline">
            {accountLabel ? (
              accountLabel
            ) : hasUsableToken ? (
              <Trans>Profile incomplete</Trans>
            ) : (
              <Trans>LOCAL</Trans>
            )}
          </Badge>
          <Button
            variant={syncEnabled ? "outline" : "secondary"}
            onClick={toggleSync}
            disabled={!canToggleActiveProfile}
          >
            <Power className="size-4" />
            {syncEnabled ? <Trans>Sync on</Trans> : <Trans>Sync off</Trans>}
          </Button>
          {accountEmailVerified === false ? (
            <Badge variant="destructive">
              <Trans>Email not verified</Trans>
            </Badge>
          ) : null}
          {disabledReason === "device_limit" ? (
            <Badge variant="destructive">
              <Trans>Device limit reached</Trans>
            </Badge>
          ) : null}
          {status || tokenStatus ? (
            <Badge variant="outline">{tokenStatus || status}</Badge>
          ) : null}
        </div>
      </SettingsPanel>

      <SettingsPanel title={<Trans>Personal Sync Server</Trans>}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <SettingsField label={<Trans>Personal Sync URL</Trans>}>
            <Input
              value={personalBaseUrl}
              onChange={(event) => setPersonalBaseUrl(event.target.value)}
              placeholder={t`http://192.168.1.20:8787`}
            />
          </SettingsField>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="outline"
            onClick={connectPersonal}
            disabled={!personalProfile.baseUrl || busy !== null}
          >
            <Cloud className="size-4" />
            <Trans>Connect Personal Sync</Trans>
          </Button>
          {activeSyncMode === "personal" ? (
            <Badge variant="outline">
              <Trans>Personal active</Trans>
            </Badge>
          ) : null}
        </div>
      </SettingsPanel>

      {showSyncAllPrompt ? (
        <SettingsPanel title={<Trans>Sync existing local tales?</Trans>}>
          <div className="flex flex-wrap gap-2">
            <Button onClick={syncAllLocalTales} disabled={busy !== null}>
              <Upload className="size-4" />
              <Trans>Sync all local tales</Trans>
            </Button>
            <Button
              variant="outline"
              onClick={keepExistingLocalPrivate}
              disabled={busy !== null}
            >
              <Trans>Keep existing tales private</Trans>
            </Button>
          </div>
        </SettingsPanel>
      ) : null}

      <Dialog open={needsProfileCompletion}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              <Trans>Complete your profile</Trans>
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
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button
              onClick={completeProfile}
              disabled={profileBusy || profileDisplayName.trim().length === 0}
            >
              <Trans>Continue</Trans>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsStack>
  );
}

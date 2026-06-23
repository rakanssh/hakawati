import { useCallback, useEffect, useMemo, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { AlertTriangle, Cloud, LogOut, Power } from "lucide-react";
import { toast } from "sonner";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
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
import { getSyncUiKind } from "@/lib/sync-ui";
import { useSyncSettingsStore } from "@/store";
import {
  getSyncProfile,
  setSyncProfileDisabled,
  upsertSyncProfile,
} from "@/repositories/sync.repository";
import {
  createSyncTransport,
  prepareHostedSync,
  fetchSyncCapabilities,
  signInHostedSync,
  updateHostedAccountProfile,
  type SyncProfile,
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

const HOSTED_PROFILE_ID = "hosted";
const PERSONAL_PROFILE_ID = "personal";
const PROFILE_UPDATE_TIMEOUT_MS = 15_000;

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
  const hasRefreshToken = useSyncSettingsStore(
    (state) => state.hasRefreshToken,
  );
  const hostedRefreshFailed = useSyncSettingsStore(
    (state) => state.hostedRefreshFailed,
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
  const [busy, setBusy] = useState<string | null>(null);
  const [profileBusy, setProfileBusy] = useState(false);
  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [status, setStatus] = useState<string>("");
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [disabledReason, setDisabledReason] = useState<string | null>(null);
  const [undecidedTales, setUndecidedTales] = useState<UndecidedTale[]>([]);
  const [resolverOpen, setResolverOpen] = useState(false);

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

  const syncUiStatus =
    syncUiKind === "reconnecting" ? t`Reconnecting...` : status;
  const hasAnySession = Boolean(accessToken || hasRefreshToken || accountLabel);
  const cloudConfigured = hostedProfile.baseUrl.length > 0;
  const showSyncControls = hasAnySession || activeSyncMode === "personal";
  const canReviewUndecidedTales =
    syncEnabled &&
    undecidedTales.length > 0 &&
    (syncUiKind === "signed-in" || syncUiKind === "personal");

  useEffect(() => {
    getSyncProfile(profile.id)
      .then((stored) => {
        setSyncEnabled(stored?.enabled === true);
        setDisabledReason(stored?.disabledReason ?? null);
      })
      .catch(() => undefined);
  }, [profile.id]);

  const refreshUndecidedTales = useCallback(
    async (
      profileId: string = profile.id,
      options: { open?: boolean; force?: boolean } = {},
    ) => {
      if (!options.force && (!syncEnabled || profile.baseUrl.length === 0)) {
        if (profileId === profile.id) setUndecidedTales([]);
        return [];
      }
      const tales = await listUndecidedTales(profileId);
      if (profileId === profile.id || options.open) setUndecidedTales(tales);
      if (options.open && tales.length > 0) setResolverOpen(true);
      return tales;
    },
    [profile.baseUrl.length, profile.id, syncEnabled],
  );

  useEffect(() => {
    void refreshUndecidedTales();
    const removeListener = addSyncChangedListener(() => {
      void refreshUndecidedTales();
    });
    return removeListener;
  }, [refreshUndecidedTales]);

  async function signInForToken() {
    const result = await signInHostedSync({ profile: hostedProfile });
    if (result.refreshToken) {
      await setHostedRefreshToken(HOSTED_PROFILE_ID, result.refreshToken);
    }
    const expiresAt =
      result.expiresIn && result.expiresIn > 0
        ? Date.now() + result.expiresIn * 1000
        : null;
    setAccessToken(result.accessToken, expiresAt, Boolean(result.refreshToken));
    return result.accessToken;
  }

  function signOut() {
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
        setResolverOpen(false);
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
      await decideTaleSyncPreference(profile.id, taleId, policy);
      await refreshUndecidedTales();
      notifySyncChanged();
    });
  }

  async function decideAll(policy: "sync" | "private") {
    await run(`${policy}-all`, async () => {
      const ids = undecidedTales.map((tale) => tale.id);
      await decideAllTaleSyncPreferences(profile.id, ids, policy);
      setUndecidedTales([]);
      setResolverOpen(false);
      notifySyncChanged();
    });
  }

  return (
    <SettingsStack>
      <SettingsPanel
        title={
          <span className="inline-flex items-center gap-2">
            <Cloud className="size-4" />
            <Trans>Account & Sync</Trans>
          </span>
        }
      >
        <div className="flex flex-col gap-3 border-t border-border/70 pt-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="size-10 border border-border/70">
              <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
                {syncUiKind === "reconnecting" ? (
                  <Cloud className="size-4 animate-pulse" />
                ) : accountLabel ? (
                  avatarInitial(accountLabel)
                ) : (
                  <Cloud className="size-4" />
                )}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
                <div className="truncate font-semibold">
                  {accountLabel ? (
                    accountLabel
                  ) : syncUiKind === "personal" ? (
                    <Trans>Personal Sync</Trans>
                  ) : syncUiKind === "profile-incomplete" ? (
                    <Trans>Complete profile</Trans>
                  ) : syncUiKind === "reconnecting" ? (
                    <Trans>Reconnecting...</Trans>
                  ) : (
                    <Trans>Not signed in</Trans>
                  )}
                </div>
                {accountEmailVerified === false ? (
                  <div className="flex min-w-0 items-center gap-1.5 text-sm text-amber-700 dark:text-amber-300">
                    <AlertTriangle className="size-3.5 shrink-0" />
                    <span className="truncate">
                      <Trans>Email not verified</Trans>
                    </span>
                  </div>
                ) : null}
              </div>
              <div className="mt-1 grid gap-0.5 text-sm">
                <div
                  className={
                    syncUiKind === "device-limit" || !cloudConfigured
                      ? "flex min-w-0 items-center gap-2 text-destructive"
                      : "flex min-w-0 items-center gap-2 text-muted-foreground"
                  }
                >
                  <Cloud className="size-3.5 shrink-0" />
                  <span className="truncate">
                    {syncUiKind === "signed-in" ? (
                      <Trans>Cloud sync on</Trans>
                    ) : syncUiKind === "reconnecting" ? (
                      <Trans>Reconnecting</Trans>
                    ) : syncUiKind === "sync-off" ? (
                      <Trans>Sync off</Trans>
                    ) : syncUiKind === "device-limit" ? (
                      <Trans>Device limit reached</Trans>
                    ) : syncUiKind === "personal" ? (
                      <Trans>Personal</Trans>
                    ) : syncUiKind === "profile-incomplete" ? (
                      <Trans>Profile incomplete</Trans>
                    ) : (
                      <Trans>Local profile</Trans>
                    )}
                  </span>
                </div>
                {!cloudConfigured ? (
                  <div className="flex min-w-0 items-center gap-2 text-destructive">
                    <AlertTriangle className="size-3.5 shrink-0" />
                    <span className="truncate">
                      <Trans>Cloud service is not configured</Trans>
                    </span>
                  </div>
                ) : null}
                {syncUiStatus ? (
                  <div className="truncate text-muted-foreground">
                    {syncUiStatus}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
            {needsBrowserLogin ? (
              <Button
                variant="default"
                onClick={connect}
                disabled={!canConnect || busy !== null}
              >
                <Cloud className="size-4" />
                <Trans>Log in / Sign up</Trans>
              </Button>
            ) : null}
            {showSyncControls ? (
              <>
                {hasAnySession ? (
                  <Button variant="outline" onClick={signOut}>
                    <LogOut className="size-4" />
                    <Trans>Sign out</Trans>
                  </Button>
                ) : null}
                <Button
                  variant={syncEnabled ? "outline" : "secondary"}
                  onClick={toggleSync}
                  disabled={!canToggleActiveProfile}
                >
                  <Power className="size-4" />
                  {syncEnabled ? (
                    <Trans>Disable sync</Trans>
                  ) : (
                    <Trans>Enable sync</Trans>
                  )}
                </Button>
              </>
            ) : null}
            {canReviewUndecidedTales ? (
              <Button
                variant="secondary"
                onClick={() => setResolverOpen(true)}
                disabled={busy !== null}
              >
                <Trans>Review undecided tales</Trans>
              </Button>
            ) : null}
          </div>
        </div>
      </SettingsPanel>

      <SettingsPanel title={<Trans>Advanced</Trans>}>
        <Accordion type="single" collapsible>
          <AccordionItem value="cloud">
            <AccordionTrigger>
              <Trans>Cloud service</Trans>
            </AccordionTrigger>
            <AccordionContent>
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
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="personal">
            <AccordionTrigger>
              <Trans>Personal sync server</Trans>
            </AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                <SettingsField label={<Trans>Personal Sync URL</Trans>}>
                  <Input
                    value={personalBaseUrl}
                    onChange={(event) => setPersonalBaseUrl(event.target.value)}
                    placeholder={t`http://192.168.1.20:8787`}
                  />
                </SettingsField>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
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
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </SettingsPanel>

      <Dialog open={resolverOpen} onOpenChange={setResolverOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              <Trans>Review undecided tales</Trans>
            </DialogTitle>
            <DialogDescription>
              <Trans>
                Choose which local tales should sync now and which should stay
                private.
              </Trans>
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[50vh] overflow-y-auto pe-1">
            <div className="grid gap-2">
              {undecidedTales.map((tale) => (
                <div
                  key={tale.id}
                  className="grid gap-2 border border-border/70 p-2 sm:grid-cols-[1fr_auto] sm:items-center"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{tale.name}</div>
                    <div className="truncate text-sm text-muted-foreground">
                      {tale.description || t`No description yet.`}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(tale.updatedAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex gap-2 sm:justify-end">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void decideOne(tale.id, "private")}
                      disabled={busy !== null}
                    >
                      <Trans>Private</Trans>
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => void decideOne(tale.id, "sync")}
                      disabled={busy !== null}
                    >
                      <Trans>Sync</Trans>
                    </Button>
                  </div>
                </div>
              ))}
              {undecidedTales.length === 0 ? (
                <div className="border border-dashed border-border/80 p-3 text-center text-sm text-muted-foreground">
                  <Trans>No undecided tales.</Trans>
                </div>
              ) : null}
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setResolverOpen(false)}
              disabled={busy !== null}
            >
              <Trans>Later</Trans>
            </Button>
            <Button
              variant="outline"
              onClick={() => void decideAll("private")}
              disabled={busy !== null || undecidedTales.length === 0}
            >
              <Trans>Keep all private</Trans>
            </Button>
            <Button
              onClick={() => void decideAll("sync")}
              disabled={busy !== null || undecidedTales.length === 0}
            >
              <Trans>Sync all</Trans>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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

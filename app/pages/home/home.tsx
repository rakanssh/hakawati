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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  GenerateScenarioDialog,
  ScenarioPreviewCard,
} from "@/components/scenario";
import { TaleConflictDialog } from "@/components/tales/tale-conflict-dialog";
import {
  SettingsModal,
  type GlobalSettingsSectionId,
} from "@/components/layout/settings";
import { WhatsNewModal } from "@/components/layout";
import placeholderImage from "@/assets/scen-ph.png";
import { useLoadTale } from "@/hooks/useGameSaves";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useScenariosList } from "@/hooks/useScenarios";
import {
  useCatalogClient,
  useCatalogScenarioList,
} from "@/hooks/useCatalogScenarios";
import { useTaleLibrary } from "@/hooks/useTaleLibrary";
import { bytesToObjectUrl } from "@/lib/utils";
import { imageBadgeClass } from "@/lib/card-badges";
import { getSyncUiKind } from "@/lib/sync-ui";
import {
  getSyncProfile,
  upsertSyncProfile,
} from "@/repositories/sync.repository";
import {
  createSyncTransport,
  isHostedSignInCancelledError,
  prepareHostedSync,
  registerSyncDevice,
  signInHostedSync,
  type SyncProfile,
} from "@/services/sync";
import {
  addSyncChangedListener,
  notifySyncChanged,
  wakeSyncBackground,
} from "@/services/sync-wakeup";
import { setHostedRefreshToken } from "@/services/secret-store";
import { useLastPlayedStore } from "@/store/useLastPlayedStore";
import {
  isModelRoleConfigured,
  useSettingsStore,
} from "@/store/useSettingsStore";
import { useSyncSettingsStore } from "@/store/useSyncSettingsStore";
import { useTaleStore } from "@/store/useTaleStore";
import { useUpdateStore } from "@/store/useUpdateStore";
import { useVersionStore } from "@/store/useVersionStore";
import type { ScenarioHead } from "@/types/context.type";
import type { CatalogScenarioRecord } from "@/types/catalog.type";
import type { LibraryTaleItem } from "@/lib/tale-library";
import type { TaleConflictChoice } from "@/hooks/useTaleLibrary";
import { getVersion } from "@tauri-apps/api/app";
import { useNavigate } from "@tanstack/react-router";
import { Trans, useLingui } from "@lingui/react/macro";
import {
  AlertTriangle,
  ChevronRight,
  Cloud,
  LogIn,
  Loader2,
  Plus,
  Play,
  Sparkles,
  UserRound,
  WandSparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";

const HOSTED_PROFILE_ID = "hosted";

function avatarInitial(label: string) {
  return (label.trim()[0] ?? "?").toUpperCase();
}

type ShelfProps = {
  title: React.ReactNode;
  action: React.ReactNode;
  children: React.ReactNode;
};

function Shelf({ title, action, children }: ShelfProps) {
  return (
    <section className="min-w-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="truncate text-lg font-semibold tracking-normal">
            {title}
          </h2>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {action}
        </div>
      </div>
      <ScrollArea scrollbars="horizontal" className="w-full">
        <div className="flex snap-x gap-2 px-2 pb-3 sm:px-0 lg:gap-3">
          {children}
        </div>
      </ScrollArea>
    </section>
  );
}

function ShelfState({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-28 w-[60vw] max-w-56 shrink-0 snap-start items-center justify-center border border-dashed border-border/80 bg-card/35 p-2.5 text-center text-sm text-muted-foreground sm:min-h-32 sm:w-60 sm:max-w-64 sm:p-3 lg:w-64">
      {children}
    </div>
  );
}

function catalogAssetUrl(baseUrl: string, path: string | null | undefined) {
  if (!path) return placeholderImage;
  if (/^https?:\/\//i.test(path)) return path;
  return `${baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "")}${path}`;
}

function TaleCard({
  item,
  loading,
  disabled,
  syncActive,
  syncStatusLoading,
  onLoad,
}: {
  item: LibraryTaleItem;
  loading: boolean;
  disabled: boolean;
  syncActive: boolean;
  syncStatusLoading: boolean;
  onLoad: (item: LibraryTaleItem) => void;
}) {
  const { t } = useLingui();
  const isRemote = item.source === "remote";
  const title = isRemote ? item.remoteTale.title : item.localTale.name;
  const description = isRemote
    ? item.remoteTale.lastEntryPreview ||
      item.remoteTale.description ||
      t`No description yet.`
    : item.localTale.lastLogEntry?.text ||
      item.localTale.description ||
      t`No description yet.`;
  const thumbnail = isRemote ? null : item.localTale.thumbnail;
  const hasConflict =
    syncActive && item.source === "local" && item.sync?.status === "conflict";
  const isSynced = syncActive && (isRemote || Boolean(item.sync));
  const syncStatusUnknown =
    syncActive && item.source === "local" && !item.sync && syncStatusLoading;
  const statusLabel = hasConflict
    ? t`Needs review`
    : isSynced
      ? t`Cloud`
      : t`Local`;

  return (
    <ScenarioPreviewCard
      variant="shelf"
      title={title}
      summary={description}
      imageSrc={thumbnail ? bytesToObjectUrl(thumbnail) : placeholderImage}
      imageAlt={t`${title} tale`}
      ariaLabel={t`Load ${title}`}
      disabled={disabled || loading}
      imageBadges={
        !loading && syncActive && !syncStatusUnknown ? (
          <Badge
            className={`${imageBadgeClass} ${
              hasConflict ? "text-destructive" : ""
            }`}
          >
            {statusLabel}
          </Badge>
        ) : null
      }
      footer={
        loading ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" />
            <Trans>Loading…</Trans>
          </span>
        ) : null
      }
      onOpen={() => onLoad(item)}
    />
  );
}

function PublicScenarioCard({
  scenario,
  baseUrl,
  onView,
}: {
  scenario: CatalogScenarioRecord;
  baseUrl: string;
  onView: (scenario: CatalogScenarioRecord) => void;
}) {
  const { t } = useLingui();
  return (
    <ScenarioPreviewCard
      variant="shelf"
      title={scenario.title}
      summary={scenario.summary}
      imageSrc={catalogAssetUrl(baseUrl, scenario.thumbnail?.downloadUrl)}
      imageAlt={t`${scenario.title} public scenario`}
      ariaLabel={t`View ${scenario.title}`}
      onOpen={() => onView(scenario)}
    />
  );
}

function ScenarioCard({
  scenario,
  onView,
}: {
  scenario: ScenarioHead;
  onView: (id: string) => void;
}) {
  const { t } = useLingui();

  return (
    <ScenarioPreviewCard
      variant="shelf"
      title={scenario.name}
      summary={scenario.description || t`No description yet.`}
      imageSrc={
        scenario.thumbnail
          ? bytesToObjectUrl(scenario.thumbnail)
          : placeholderImage
      }
      imageAlt={t`${scenario.name} scenario`}
      ariaLabel={t`Open ${scenario.name}`}
      onOpen={() => onView(scenario.id)}
    />
  );
}

export default function Home() {
  const navigate = useNavigate();
  const { t } = useLingui();
  const narratorConfig = useSettingsStore((state) => state.modelRoles.narrator);
  const utilityConfig = useSettingsStore((state) => state.modelRoles.utility);
  const { name, description, log, id: currentTaleId } = useTaleStore();
  const { isMobilePlatform } = useIsMobile();
  const lastEntry = log.at(-1);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] =
    useState<GlobalSettingsSectionId>("ai-setup");
  const [generateOpen, setGenerateOpen] = useState(false);
  const [whatsNewOpen, setWhatsNewOpen] = useState(false);
  const [loadingTaleId, setLoadingTaleId] = useState<string | null>(null);
  const [accountBusy, setAccountBusy] = useState(false);
  const [signInController, setSignInController] =
    useState<AbortController | null>(null);
  const signInControllerRef = useRef<AbortController | null>(null);
  const [conflictItem, setConflictItem] = useState<LibraryTaleItem | null>(
    null,
  );
  const [resolvingConflict, setResolvingConflict] = useState(false);
  const nonPlayTabs: readonly GlobalSettingsSectionId[] = [
    "appearance",
    "ai-setup",
    "generation",
    "cloud-sync",
  ];
  const { lastPlayedTaleId } = useLastPlayedStore();
  const { load } = useLoadTale();
  const tales = useTaleLibrary(1, 6);
  const scenarios = useScenariosList(1, 6);
  const catalog = useCatalogClient();
  const publicScenarios = useCatalogScenarioList(catalog, {
    limit: 6,
    sort: "popular",
  });
  const hasLoadedRef = useRef(false);
  const autoRegisterDeviceKeyRef = useRef("");
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
  const setAccessToken = useSyncSettingsStore((state) => state.setAccessToken);
  const setAccount = useSyncSettingsStore((state) => state.setAccount);
  const getOrCreateHostedDeviceId = useSyncSettingsStore(
    (state) => state.getOrCreateHostedDeviceId,
  );
  const setActiveSyncMode = useSyncSettingsStore(
    (state) => state.setActiveSyncMode,
  );
  const pendingChangelogVersion = useUpdateStore(
    (state) => state.pendingChangelogVersion,
  );
  const pendingChangelogNotes = useUpdateStore(
    (state) => state.pendingChangelogNotes,
  );
  const clearPendingChangelog = useUpdateStore(
    (state) => state.clearPendingChangelog,
  );
  const { lastSeenVersion, setLastSeenVersion } = useVersionStore();

  const { hasIssues, issues } = useMemo(() => {
    const missing: string[] = [];
    if (!narratorConfig.baseUrl?.trim()) missing.push("Narrator API URL");
    if (!narratorConfig.model) missing.push("Narrator model");
    return { hasIssues: missing.length > 0, issues: missing };
  }, [narratorConfig]);

  const utilityReady = isModelRoleConfigured(utilityConfig);

  const hasActiveGame = Boolean(name || description || log.length > 0);
  const canContinue = hasActiveGame && log.length > 0 && !hasIssues;
  const accountLabel = accountDisplayName || accountEmail;
  const personalActive = Boolean(
    activeSyncMode === "personal" && personalBaseUrl.trim(),
  );
  const [homeSyncProfile, setHomeSyncProfile] = useState<{
    enabled: boolean;
    disabledReason: string | null;
  } | null>(null);
  const syncUiKind = getSyncUiKind({
    activeSyncMode,
    personalBaseUrl,
    accessToken,
    accessTokenExpiresAt,
    hasRefreshToken,
    accountLabel,
    syncEnabled: homeSyncProfile?.enabled,
    disabledReason: homeSyncProfile?.disabledReason,
    refreshFailed: hostedRefreshFailed,
  });
  const signedIn =
    syncUiKind === "signed-in" ||
    syncUiKind === "profile-incomplete" ||
    syncUiKind === "sync-off" ||
    syncUiKind === "device-limit";
  const accountSettingsState =
    signedIn || syncUiKind === "personal" || syncUiKind === "reconnecting";

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
  const canRegisterHostedDevice =
    activeSyncMode === "hosted" &&
    hostedProfile.baseUrl.length > 0 &&
    deviceName.trim().length > 0 &&
    devicePlatform.trim().length > 0;

  useEffect(() => {
    let disposed = false;

    const refreshSyncProfile = () => {
      getSyncProfile(hostedProfile.id)
        .then((profile) => {
          if (disposed) return;
          setHomeSyncProfile(
            profile
              ? {
                  enabled: profile.enabled === true,
                  disabledReason: profile.disabledReason ?? null,
                }
              : null,
          );
        })
        .catch(() => {
          if (!disposed) setHomeSyncProfile(null);
        });
    };

    refreshSyncProfile();
    const removeListener = addSyncChangedListener(refreshSyncProfile);
    return () => {
      disposed = true;
      removeListener();
    };
  }, [hostedProfile.id]);

  useEffect(() => {
    if (
      homeSyncProfile?.disabledReason !== "device_limit" ||
      !canRegisterHostedDevice ||
      !accountLabel.trim() ||
      !hostedProfile.deviceId ||
      accessToken.trim().length === 0 ||
      (accessTokenExpiresAt !== null && accessTokenExpiresAt <= Date.now())
    ) {
      return;
    }

    const currentDeviceId = hostedProfile.deviceId;
    const key = `${accountId}:${currentDeviceId}`;
    if (autoRegisterDeviceKeyRef.current === key) return;
    autoRegisterDeviceKeyRef.current = key;

    void (async () => {
      const appVersion = await getVersion().catch(() => "0.15.0");
      await registerSyncDevice(
        createSyncTransport({
          profile: hostedProfile,
          accessToken: accessToken.trim(),
        }),
        {
          id: currentDeviceId,
          name: deviceName.trim(),
          platform: devicePlatform.trim(),
          appVersion,
        },
      );
      await upsertSyncProfile({
        ...hostedProfile,
        enabled: true,
        disabledReason: null,
      });
      setHomeSyncProfile({ enabled: true, disabledReason: null });
      wakeSyncBackground();
      notifySyncChanged();
    })().catch(() => undefined);
  }, [
    accessToken,
    accessTokenExpiresAt,
    accountId,
    accountLabel,
    canRegisterHostedDevice,
    deviceName,
    devicePlatform,
    homeSyncProfile?.disabledReason,
    hostedProfile,
  ]);

  const openSettings = (tab: GlobalSettingsSectionId) => {
    setSettingsTab(tab);
    setSettingsOpen(true);
  };

  const handleLoadTale = async (item: LibraryTaleItem) => {
    if (item.source === "local" && item.sync?.status === "conflict") {
      setConflictItem(item);
      return;
    }
    const id = item.source === "local" ? item.localTale.id : item.remoteTale.id;
    setLoadingTaleId(id);
    try {
      await tales.loadIntoGame(item);
      navigate({ to: "/play" });
    } catch (_error) {
      toast.error(t`Failed to load tales.`);
    } finally {
      setLoadingTaleId(null);
    }
  };

  const handleResolveConflict = async (choice: TaleConflictChoice) => {
    if (!conflictItem || conflictItem.source !== "local") return;
    setResolvingConflict(true);
    try {
      const taleId = await tales.resolveConflict(conflictItem, choice);
      await load(taleId);
      setConflictItem(null);
      toast.success(t`Conflict resolved`);
      navigate({ to: "/play" });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t`Failed to resolve conflict`,
      );
    } finally {
      setResolvingConflict(false);
    }
  };

  const handleAccountClick = async () => {
    if (accountSettingsState || personalActive || !hostedProfile.baseUrl) {
      openSettings("cloud-sync");
      return;
    }

    setAccountBusy(true);
    const controller = new AbortController();
    signInControllerRef.current = controller;
    setSignInController(controller);
    try {
      const result = await signInHostedSync({
        profile: hostedProfile,
        signal: controller.signal,
      });
      signInControllerRef.current = null;
      setSignInController(null);
      if (result.refreshToken) {
        await setHostedRefreshToken(HOSTED_PROFILE_ID, result.refreshToken);
      }
      const expiresAt =
        result.expiresIn && result.expiresIn > 0
          ? Date.now() + result.expiresIn * 1000
          : null;
      setAccessToken(
        result.accessToken,
        expiresAt,
        Boolean(result.refreshToken),
      );
      const appVersion = await getVersion().catch(() => "0.15.0");
      const prepared = await prepareHostedSync({
        profile: hostedProfile,
        accessToken: result.accessToken,
        device: {
          name: deviceName.trim(),
          platform: devicePlatform.trim(),
          appVersion,
        },
        getDeviceIdForAccount: getOrCreateHostedDeviceId,
      });
      setAccount({
        id: prepared.account.id,
        displayName: prepared.account.displayName,
        email: prepared.account.emailNormalized,
      });
      setActiveSyncMode("hosted");
      if (!prepared.device) {
        notifySyncChanged();
        toast.error(
          t`This device is not syncing because the device limit was reached`,
        );
        return;
      }
      wakeSyncBackground();
      notifySyncChanged();
      openSettings("cloud-sync");
      toast.success(t`Cloud sync connected`);
    } catch (error) {
      if (!isHostedSignInCancelledError(error)) {
        toast.error(error instanceof Error ? error.message : t`Sync failed`);
      }
    } finally {
      if (signInControllerRef.current === controller) {
        signInControllerRef.current = null;
      }
      setSignInController((current) =>
        current === controller ? null : current,
      );
      setAccountBusy(false);
    }
  };

  useEffect(
    () => () => {
      signInControllerRef.current?.abort();
    },
    [],
  );

  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    if (!lastPlayedTaleId || currentTaleId === lastPlayedTaleId) {
      return;
    }

    load(lastPlayedTaleId).catch((error) => {
      console.error("Failed to auto-load last played tale:", error);
    });
  }, [lastPlayedTaleId, currentTaleId, load]);

  useEffect(() => {
    const checkForWhatsNew = async () => {
      try {
        const currentVersion = await getVersion();

        if (
          pendingChangelogVersion &&
          pendingChangelogNotes &&
          lastSeenVersion !== currentVersion
        ) {
          setWhatsNewOpen(true);
        }
      } catch (error) {
        console.error("Failed to check app version:", error);
      }
    };

    void checkForWhatsNew();
  }, [pendingChangelogVersion, pendingChangelogNotes, lastSeenVersion]);

  const handleWhatsNewClose = async () => {
    try {
      const currentVersion = await getVersion();
      setLastSeenVersion(currentVersion);
      clearPendingChangelog();
      setWhatsNewOpen(false);
    } catch (error) {
      console.error("Failed to update last seen version:", error);
      setWhatsNewOpen(false);
    }
  };

  const quickstartControl = (
    <Button
      size="sm"
      onClick={() => navigate({ to: "/quickstart" })}
      disabled={hasIssues}
    >
      <Sparkles />
      <Trans>Quickstart</Trans>
    </Button>
  );

  const accountControl = (
    <div className="flex min-w-0 items-center gap-2">
      <Button
        variant="outline"
        onClick={handleAccountClick}
        disabled={accountBusy}
        className="h-14 w-64 max-w-full justify-start gap-2.5 border-primary/25 bg-card/70 px-2.5 shadow-xs hover:border-primary/45 hover:bg-accent/45"
      >
        <span className="relative shrink-0">
          <Avatar className="size-9 border border-border/70">
            <AvatarFallback className="bg-primary/10 text-sm font-semibold text-primary">
              {accountBusy ? (
                <Loader2 className="size-4 animate-spin" />
              ) : signedIn && accountLabel ? (
                avatarInitial(accountLabel)
              ) : syncUiKind === "reconnecting" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : hostedProfile.baseUrl && syncUiKind !== "personal" ? (
                <LogIn className="size-4" />
              ) : (
                <UserRound className="size-4" />
              )}
            </AvatarFallback>
          </Avatar>
          <span
            className={
              syncUiKind === "signed-in"
                ? "absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-card bg-primary"
                : "absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-card bg-muted-foreground"
            }
          />
        </span>
        <span className="grid min-w-0 flex-1 text-left leading-tight">
          <span className="truncate font-semibold">
            {accountBusy ? (
              <Trans>Connecting...</Trans>
            ) : signedIn && accountLabel ? (
              accountLabel
            ) : signedIn ? (
              <Trans>Complete profile</Trans>
            ) : syncUiKind === "reconnecting" ? (
              <Trans>Reconnecting...</Trans>
            ) : syncUiKind === "personal" ? (
              <Trans>Personal Sync</Trans>
            ) : (
              <Trans>Log in / Sign up</Trans>
            )}
          </span>
          <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-normal text-muted-foreground">
            {syncUiKind === "signed-in" || syncUiKind === "reconnecting" ? (
              <Cloud className="size-3" />
            ) : (
              <UserRound className="size-3" />
            )}
            <span className="truncate">
              {syncUiKind === "signed-in" ? (
                <Trans>Cloud sync on</Trans>
              ) : syncUiKind === "sync-off" ? (
                <Trans>Sync off</Trans>
              ) : syncUiKind === "reconnecting" ? (
                <Trans>Restoring session</Trans>
              ) : syncUiKind === "personal" ? (
                <Trans>Personal server</Trans>
              ) : syncUiKind === "device-limit" ? (
                <Trans>Device limit reached</Trans>
              ) : (
                <Trans>Local profile</Trans>
              )}
            </span>
          </span>
        </span>
        <ChevronRight className="ml-auto size-4 text-muted-foreground rtl:rotate-180" />
      </Button>
    </div>
  );

  return (
    <main className="relative min-h-full overflow-x-hidden">
      <div
        className="mx-auto flex w-full max-w-screen-2xl flex-col gap-5 px-3 py-4 sm:px-4 lg:px-6"
        style={
          hasActiveGame
            ? {
                paddingBottom: isMobilePlatform
                  ? "calc(7rem + env(safe-area-inset-bottom))"
                  : "5.5rem",
              }
            : undefined
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">{accountControl}</div>
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            {quickstartControl}
          </div>
        </div>

        {hasIssues && (
          <div className="flex flex-col gap-2 border border-destructive/40 bg-destructive/10 p-2.5 text-destructive sm:flex-row sm:items-center">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <div className="min-w-0 flex-1">
              <div className="font-semibold leading-tight">
                <Trans>Setup required</Trans>
              </div>
              <p className="text-sm">
                <Trans>
                  Missing settings: {issues.join(", ")}. Configure your API in
                  Settings.
                </Trans>
              </p>
            </div>
            <Button
              variant="destructive"
              onClick={() => openSettings("ai-setup")}
            >
              <Trans>Open Settings</Trans>
            </Button>
          </div>
        )}

        <div className="flex flex-col gap-5">
          <Shelf
            title={<Trans>Latest Tales</Trans>}
            action={
              <Button
                variant="outline"
                size="sm"
                onClick={() => navigate({ to: "/tales" })}
              >
                <Trans>View all</Trans>
                <ChevronRight className="rtl:rotate-180" />
              </Button>
            }
          >
            {tales.loading && (
              <ShelfState>
                <Trans>Loading…</Trans>
              </ShelfState>
            )}
            {Boolean(tales.error) && (
              <ShelfState>
                <Trans>Failed to load tales.</Trans>
              </ShelfState>
            )}
            {Boolean(tales.remoteError) && (
              <ShelfState>
                <Trans>Cloud tales are unavailable.</Trans>
              </ShelfState>
            )}
            {!tales.loading && !tales.error && tales.items.length === 0 && (
              <ShelfState>
                <Trans>No tales yet.</Trans>
              </ShelfState>
            )}
            {tales.items.map((tale) => (
              <TaleCard
                key={
                  tale.source === "local"
                    ? `local-${tale.localTale.id}`
                    : `remote-${tale.remoteTale.id}`
                }
                item={tale}
                loading={
                  loadingTaleId ===
                  (tale.source === "local"
                    ? tale.localTale.id
                    : tale.remoteTale.id)
                }
                disabled={hasIssues}
                syncActive={tales.syncActive}
                syncStatusLoading={tales.syncStatesLoading}
                onLoad={handleLoadTale}
              />
            ))}
          </Shelf>

          {catalog.enabled ? (
            <Shelf
              title={<Trans>Public Scenarios</Trans>}
              action={
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate({ to: "/scenarios?tab=discover" })}
                >
                  <Trans>Discover</Trans>
                  <ChevronRight className="rtl:rotate-180" />
                </Button>
              }
            >
              {publicScenarios.loading && (
                <ShelfState>
                  <Trans>Loading...</Trans>
                </ShelfState>
              )}
              {Boolean(publicScenarios.error) && (
                <ShelfState>
                  <Trans>Public scenarios are unavailable.</Trans>
                </ShelfState>
              )}
              {!publicScenarios.loading &&
                !publicScenarios.error &&
                publicScenarios.items.length === 0 && (
                  <ShelfState>
                    <Trans>No public scenarios yet.</Trans>
                  </ShelfState>
                )}
              {publicScenarios.items.map((scenario) => (
                <PublicScenarioCard
                  key={scenario.id}
                  scenario={scenario}
                  baseUrl={catalog.baseUrl}
                  onView={(item) =>
                    navigate({ to: `/scenarios/catalog/${item.id}` })
                  }
                />
              ))}
            </Shelf>
          ) : null}

          <Shelf
            title={<Trans>Your Scenarios</Trans>}
            action={
              <>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="icon-sm" aria-label={t`Create Scenario`}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem
                      onClick={() => navigate({ to: "/scenarios/new" })}
                    >
                      <Plus className="h-4 w-4" />
                      <Trans>New scenario</Trans>
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!utilityReady}
                      onClick={() => setGenerateOpen(true)}
                    >
                      <WandSparkles className="h-4 w-4" />
                      <Trans>Generate Scenario</Trans>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => navigate({ to: "/scenarios" })}
                >
                  <Trans>View all</Trans>
                  <ChevronRight className="rtl:rotate-180" />
                </Button>
              </>
            }
          >
            {scenarios.loading && (
              <ShelfState>
                <Trans>Loading…</Trans>
              </ShelfState>
            )}
            {Boolean(scenarios.error) && (
              <ShelfState>
                <Trans>Failed to load scenarios.</Trans>
              </ShelfState>
            )}
            {!scenarios.loading &&
              !scenarios.error &&
              scenarios.items.length === 0 && (
                <ShelfState>
                  <Trans>No scenarios yet.</Trans>
                </ShelfState>
              )}
            {scenarios.items.map((scenario) => (
              <ScenarioCard
                key={scenario.id}
                scenario={scenario}
                onView={(id) => navigate({ to: `/scenarios/${id}` })}
              />
            ))}
          </Shelf>
        </div>

        <Accordion type="single" collapsible className="rounded-none">
          <AccordionItem value="how">
            <AccordionTrigger>
              <Trans>How to play</Trans>
            </AccordionTrigger>
            <AccordionContent>
              <ul className="list-disc space-y-1 pl-4 text-sm">
                <li>
                  <Trans>
                    Open Settings → set API URL/key and pick a model.
                  </Trans>
                </li>
                <li>
                  <strong>
                    <Trans>Quick Start:</Trans>
                  </strong>{" "}
                  <Trans>
                    Click &quot;Quickstart&quot; to jump right in with a guided
                    wizard, or
                  </Trans>
                </li>
                <li>
                  <Trans>
                    Go to Scenarios → Create or Import from Clipboard.
                  </Trans>
                </li>
                <li>
                  <Trans>Go to Scenarios → New Tale.</Trans>
                </li>
                <li>
                  <Trans>
                    Type actions, the AI continues. Available actions:
                  </Trans>
                  <ul className="list-disc space-y-1 pl-4 text-sm">
                    <li>
                      <Trans>Do: Act in the story.</Trans>
                    </li>
                    <li>
                      <Trans>Say: Speak something out loud.</Trans>
                    </li>
                    <li>
                      <Trans>
                        Story: Write a segment of text that the AI will treat as
                        part of the story and continue from.
                      </Trans>
                    </li>
                    <li>
                      <Trans>
                        Direct: An out of character note telling the AI to do
                        something.
                      </Trans>
                    </li>
                    <li>
                      <Trans>Continue: Continue the story.</Trans>
                    </li>
                    <li>
                      <Trans>
                        Retry: Retry the last message. Can only be done if the
                        last message is by the AI.
                      </Trans>
                    </li>
                  </ul>
                </li>
                <li>
                  <Trans>
                    In Game Master mode, the AI keeps track of stats and
                    inventory.
                  </Trans>
                </li>
              </ul>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>

      {hasActiveGame && (
        <div
          className="fixed inset-x-0 z-30 border-t border-primary/60 bg-card"
          style={{
            bottom: isMobilePlatform
              ? "calc(3.5rem + env(safe-area-inset-bottom))"
              : 0,
          }}
        >
          <div className="h-0.5 bg-primary" />
          <div className="mx-auto flex w-full max-w-screen-2xl flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center sm:px-4 lg:px-6">
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 items-center gap-2">
                <h2 className="min-w-0 truncate font-semibold">
                  {name || t`Untitled`}
                </h2>
                <Badge variant="outline" className="shrink-0 text-[10px]">
                  {log.length} {log.length === 1 ? t`entry` : t`entries`}
                </Badge>
              </div>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {(lastEntry?.text ?? description) || t`No description yet.`}
              </p>
            </div>
            <Button
              className="h-9 w-full sm:w-auto sm:min-w-36"
              onClick={() => navigate({ to: "/play" })}
              disabled={!canContinue}
            >
              <Play />
              <Trans>Continue</Trans>
            </Button>
          </div>
        </div>
      )}

      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        defaultTab={settingsTab}
        visibleTabs={nonPlayTabs}
      />
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
              <Trans>Finish signing in through your browser.</Trans>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => signInController?.abort()}>
              <Trans>Cancel</Trans>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <GenerateScenarioDialog
        open={generateOpen}
        onOpenChange={setGenerateOpen}
        onGenerated={(scenario) => {
          navigate({
            to: "/scenarios/new",
            state: (prev) => ({
              ...(prev ?? {}),
              importedScenario: scenario,
            }),
          });
        }}
      />
      <TaleConflictDialog
        item={conflictItem}
        open={Boolean(conflictItem)}
        resolving={resolvingConflict}
        onOpenChange={(open) => {
          if (!open && !resolvingConflict) setConflictItem(null);
        }}
        onResolve={handleResolveConflict}
      />
      {pendingChangelogVersion && pendingChangelogNotes && (
        <WhatsNewModal
          open={whatsNewOpen}
          onOpenChange={handleWhatsNewClose}
          version={pendingChangelogVersion}
          notes={pendingChangelogNotes}
        />
      )}
    </main>
  );
}

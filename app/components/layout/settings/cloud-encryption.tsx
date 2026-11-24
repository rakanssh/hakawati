import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { plural } from "@lingui/core/macro";
import { Trans, useLingui } from "@lingui/react/macro";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { renderSVG } from "uqr";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
  LinkRow,
  SetupList,
  StatusBanner,
} from "@/components/layout/settings/settings-rows";
import { isMobilePlatform } from "@/lib/platform";
import {
  cloudKeyScope,
  cloudPairings,
  fetchCloudKey,
  finishCloudKeySetup,
  forgetCloudEncryptionStatus,
  replaceCloudRecovery,
  resetCloudEncryption,
  resolveCloudEncryption,
  useCloudEncryptionStore,
  type CloudEncryptionStatus,
  type CloudPairing,
} from "@/services/cloud-encryption";
import {
  cloudKeyError,
  cloudKeys,
  type CloudKeySetup,
  type CloudRecoveryReplacement,
  type PairingDirection,
} from "@/services/cloud-keys";
import {
  createSyncTransport,
  fetchSyncCapabilities,
  SyncHttpError,
  type SyncTransport,
} from "@/services/sync";
import {
  addSyncChangedListener,
  wakeSyncBackground,
} from "@/services/sync-wakeup";
import type { SyncProfile } from "@/types/sync.type";

const POLL_MS = 2_000;

function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

export function useCloudEncryption(input: {
  profile: SyncProfile;
  accessToken: string;
  active: boolean;
}) {
  const { profile, accessToken, active } = input;
  const scope = cloudKeyScope(profile);
  const scopeId = scope ? `${scope.serverOrigin} ${scope.accountId}` : null;
  const status = useCloudEncryptionStore((state) =>
    active && scopeId && state.scope === scopeId ? state.status : null,
  );
  const transport = useCallback(
    () => createSyncTransport({ profile, accessToken }),
    [accessToken, profile],
  );
  const refresh = useCallback(async () => {
    if (!active || !cloudKeyScope(profile)) return null;
    const connection = transport();
    return resolveCloudEncryption({
      profile,
      transport: connection,
      capabilities: await fetchSyncCapabilities(connection),
      maxAgeMs: 0,
    });
  }, [active, profile, transport]);

  useEffect(() => {
    if (!active) return;
    void refresh().catch(() => undefined);
    return addSyncChangedListener(() => {
      if (!useCloudEncryptionStore.getState().status) {
        void refresh().catch(() => undefined);
      }
    });
  }, [active, refresh]);

  return { status, refresh, transport };
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof SyncHttpError) return error.message;
  if (error instanceof Error) return error.message;
  return fallback;
}

function useKeyErrorMessage() {
  const { t } = useLingui();
  return (error: unknown) => {
    switch (cloudKeyError(error)) {
      case "recovery_key_invalid":
        return t`Check the recovery key and try again.`;
      case "recovery_key_mismatch":
      case "cloud_key_check_failed":
        return t`This recovery key doesn't match this account.`;
      case "pairing_confirm_failed":
      case "pairing_payload_invalid":
        return t`The devices couldn't verify each other. Try again.`;
      case "pairing_code_invalid":
        return t`This isn't a Hakawati pairing code.`;
      case "pairing_expired":
        return t`This code expired. Show a new one.`;
      case "secret_store_unavailable":
        return t`This device's secure storage is unavailable.`;
      default:
        return errorMessage(error, t`Something went wrong. Try again.`);
    }
  };
}

function settled() {
  forgetCloudEncryptionStatus();
  wakeSyncBackground();
}

export function CloudEncryptionBanner({
  status,
  onSetUp,
  onUnlock,
}: {
  status: CloudEncryptionStatus | null;
  onSetUp: () => void;
  onUnlock: () => void;
}) {
  if (!status) return null;
  if (status.kind === "setup") {
    return (
      <StatusBanner
        tone="muted"
        title={<Trans>Set up encryption to sync</Trans>}
        action={
          <Button size="sm" onClick={onSetUp}>
            <Trans>Set up</Trans>
          </Button>
        }
      />
    );
  }
  if (status.kind === "locked") {
    return (
      <StatusBanner
        tone="destructive"
        title={<Trans>Unlock this device to sync</Trans>}
        detail={
          status.reason === "changed" ? (
            <Trans>The cloud key changed on another device.</Trans>
          ) : null
        }
        action={
          <Button size="sm" onClick={onUnlock}>
            <Trans>Unlock</Trans>
          </Button>
        }
      />
    );
  }
  if (status.kind === "paused") {
    return (
      <StatusBanner
        tone="destructive"
        title={
          status.reason === "downgraded" ? (
            <Trans>Sync is paused</Trans>
          ) : (
            <Trans>This cloud service can’t encrypt saves</Trans>
          )
        }
        detail={
          status.reason === "downgraded" ? (
            <Trans>The cloud stopped encrypting your saves.</Trans>
          ) : null
        }
      />
    );
  }
  return null;
}

export function CloudEncryptionLink({
  status,
  onOpen,
}: {
  status: CloudEncryptionStatus | null;
  onOpen: () => void;
}) {
  if (status?.kind !== "ready") return null;
  return (
    <LinkRow
      title={<Trans>Encryption</Trans>}
      detail={
        status.info.state === "migrating" ? (
          <Trans>Encrypting cloud saves…</Trans>
        ) : (
          <Trans>End-to-end encrypted</Trans>
        )
      }
      onClick={onOpen}
    />
  );
}

type Dialogs =
  | { kind: "setup" }
  | { kind: "enter-recovery" }
  | { kind: "new-recovery" }
  | { kind: "reset" }
  | { kind: "show"; direction: PairingDirection }
  | { kind: "scan" };

export function useCloudEncryptionDialogs() {
  const [dialog, setDialog] = useState<Dialogs | null>(null);
  return { dialog, setDialog, close: () => setDialog(null) };
}

export function CloudEncryptionPage({
  page,
  status,
  onDialog,
}: {
  page: "encryption" | "unlock";
  status: CloudEncryptionStatus | null;
  onDialog: (dialog: Dialogs) => void;
}) {
  const mobile = isMobilePlatform();
  const unlocked = status?.kind === "ready";
  if (page === "encryption" && unlocked) {
    return (
      <div className="flex flex-col gap-6">
        <SetupList>
          <LinkRow
            title={<Trans>Show a code</Trans>}
            detail={<Trans>Scan it with a new phone</Trans>}
            onClick={() => onDialog({ kind: "show", direction: "send" })}
          />
          {mobile ? (
            <LinkRow
              title={<Trans>Scan a code</Trans>}
              detail={<Trans>From a device that needs unlocking</Trans>}
              onClick={() => onDialog({ kind: "scan" })}
            />
          ) : null}
          <LinkRow
            title={<Trans>New recovery key</Trans>}
            onClick={() => onDialog({ kind: "new-recovery" })}
          />
        </SetupList>
        <ResetButton onClick={() => onDialog({ kind: "reset" })} />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <SetupList>
        {mobile ? (
          <LinkRow
            title={<Trans>Scan a code</Trans>}
            detail={<Trans>From a device that’s already unlocked</Trans>}
            onClick={() => onDialog({ kind: "scan" })}
          />
        ) : null}
        <LinkRow
          title={<Trans>Show a code</Trans>}
          detail={<Trans>Scan it with a phone that’s already unlocked</Trans>}
          onClick={() => onDialog({ kind: "show", direction: "receive" })}
        />
        <LinkRow
          title={<Trans>Enter recovery key</Trans>}
          onClick={() => onDialog({ kind: "enter-recovery" })}
        />
      </SetupList>
      <ResetButton onClick={() => onDialog({ kind: "reset" })} />
    </div>
  );
}

function ResetButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="self-start px-0.5 text-sm text-destructive underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
    >
      <Trans>Reset cloud saves</Trans>
    </button>
  );
}

export function CloudEncryptionDialogs({
  dialog,
  onDialog,
  onClose,
  profile,
  transport,
  status,
  cloudOnlyTales,
}: {
  dialog: Dialogs | null;
  onDialog: (dialog: Dialogs) => void;
  onClose: () => void;
  profile: SyncProfile;
  transport: () => SyncTransport;
  status: CloudEncryptionStatus | null;
  cloudOnlyTales: number | null;
}) {
  if (!dialog) return null;
  switch (dialog.kind) {
    case "setup":
      return (
        <SetupDialog
          profile={profile}
          transport={transport}
          onClose={onClose}
        />
      );
    case "new-recovery":
      return (
        <NewRecoveryDialog
          transport={transport}
          status={status}
          onClose={onClose}
        />
      );
    case "enter-recovery":
      return (
        <EnterRecoveryDialog
          profile={profile}
          transport={transport}
          onClose={onClose}
        />
      );
    case "reset":
      return (
        <ResetDialog
          profile={profile}
          transport={transport}
          keyId={status && "info" in status ? status.info.keyId : null}
          cloudOnlyTales={cloudOnlyTales}
          onClose={onClose}
          onReset={() => onDialog({ kind: "setup" })}
        />
      );
    case "show":
      return (
        <ShowCodeDialog
          profile={profile}
          transport={transport}
          direction={dialog.direction}
          status={status}
          onClose={onClose}
        />
      );
    case "scan":
      return (
        <ScanCodeDialog
          profile={profile}
          transport={transport}
          status={status}
          onClose={onClose}
        />
      );
  }
}

function RecoveryKeyView({
  recoveryKey,
  saved,
  onSavedChange,
}: {
  recoveryKey: string;
  saved: boolean;
  onSavedChange: (saved: boolean) => void;
}) {
  const { t } = useLingui();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-3 rounded-xs border border-border/70 bg-background/60 p-4">
        <code
          dir="ltr"
          className="text-center font-mono text-base font-semibold tracking-wider break-all select-all"
        >
          {recoveryKey}
        </code>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            void writeText(recoveryKey).then(
              () => toast.success(t`Copied`),
              () => toast.error(t`Couldn't copy`),
            )
          }
        >
          <Trans>Copy</Trans>
        </Button>
      </div>
      <Label className="flex items-center gap-2 text-sm font-normal">
        <Checkbox
          checked={saved}
          onCheckedChange={(checked) => onSavedChange(checked === true)}
        />
        <Trans>I saved my recovery key</Trans>
      </Label>
    </div>
  );
}

function SetupDialog({
  profile,
  transport,
  onClose,
}: {
  profile: SyncProfile;
  transport: () => SyncTransport;
  onClose: () => void;
}) {
  const keyError = useKeyErrorMessage();
  const [setup, setSetup] = useState<CloudKeySetup | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const scope = cloudKeyScope(profile);
  const serverOrigin = scope?.serverOrigin;
  const accountId = scope?.accountId;

  useEffect(() => {
    if (!serverOrigin || !accountId) return;
    let cancelled = false;
    setSetup(null);
    setSaved(false);
    void cloudKeys.beginSetup({ serverOrigin, accountId }).then(
      (material) => {
        if (!cancelled) setSetup(material);
      },
      (reason: unknown) => {
        if (!cancelled) setError(reason);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [accountId, serverOrigin]);

  async function finish() {
    if (!setup) return;
    setBusy(true);
    setError(null);
    try {
      await finishCloudKeySetup({ profile, transport: transport(), setup });
      settled();
      onClose();
    } catch (reason) {
      if (
        reason instanceof SyncHttpError &&
        reason.code === "cloud_key_exists"
      ) {
        toast.error(keyError(reason));
        settled();
        onClose();
        return;
      }
      setError(reason);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>
            <Trans>Save your recovery key</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Your cloud saves are encrypted on your devices. You need this key
              if you lose them. It won’t be shown again.
            </Trans>
          </DialogDescription>
        </DialogHeader>
        {setup ? (
          <RecoveryKeyView
            recoveryKey={setup.recoveryKey}
            saved={saved}
            onSavedChange={setSaved}
          />
        ) : null}
        {error ? (
          <p className="text-sm text-destructive">{keyError(error)}</p>
        ) : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            <Trans>Not now</Trans>
          </Button>
          <Button
            onClick={() => void finish()}
            disabled={!setup || !saved || busy}
          >
            <Trans>Continue</Trans>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NewRecoveryDialog({
  transport,
  status,
  onClose,
}: {
  transport: () => SyncTransport;
  status: CloudEncryptionStatus | null;
  onClose: () => void;
}) {
  const keyError = useKeyErrorMessage();
  const [replacement, setReplacement] =
    useState<CloudRecoveryReplacement | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function create() {
    if (status?.kind !== "ready") return;
    setBusy(true);
    try {
      setReplacement(await cloudKeys.newRecovery(status.session));
    } catch (reason) {
      toast.error(keyError(reason));
      onClose();
    } finally {
      setBusy(false);
    }
  }

  async function replace() {
    if (!replacement) return;
    setBusy(true);
    setError(null);
    try {
      await replaceCloudRecovery(transport(), {
        keyProof: replacement.keyProof,
        recoveryWrappedKey: replacement.recoveryWrappedKey,
      });
      onClose();
    } catch (reason) {
      setError(reason);
    } finally {
      setBusy(false);
    }
  }

  if (replacement) {
    return (
      <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>
              <Trans>New recovery key</Trans>
            </DialogTitle>
            <DialogDescription>
              <Trans>
                Your current recovery key stops working when you continue.
              </Trans>
            </DialogDescription>
          </DialogHeader>
          <RecoveryKeyView
            recoveryKey={replacement.recoveryKey}
            saved={saved}
            onSavedChange={setSaved}
          />
          {error ? (
            <p className="text-sm text-destructive">{keyError(error)}</p>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={busy}>
              <Trans>Cancel</Trans>
            </Button>
            <Button onClick={() => void replace()} disabled={!saved || busy}>
              <Trans>Continue</Trans>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <AlertDialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans>Create a new recovery key?</Trans>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Trans>Your current recovery key will stop working.</Trans>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>
            <Trans>Cancel</Trans>
          </AlertDialogCancel>
          <Button onClick={() => void create()} disabled={busy}>
            <Trans>Create</Trans>
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function EnterRecoveryDialog({
  profile,
  transport,
  onClose,
}: {
  profile: SyncProfile;
  transport: () => SyncTransport;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const keyError = useKeyErrorMessage();
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function unlock() {
    const scope = cloudKeyScope(profile);
    if (!scope) return;
    setBusy(true);
    setError("");
    try {
      const info = await fetchCloudKey(transport());
      if (!info.keyId || !info.keyCheck || !info.recoveryWrappedKey) {
        throw new Error(t`This account has no recovery key.`);
      }
      await cloudKeys.recover(scope, {
        keyId: info.keyId,
        keyCheck: info.keyCheck,
        recoveryWrappedKey: info.recoveryWrappedKey,
        recoveryKey: value,
      });
      settled();
      toast.success(t`This device is unlocked`);
      onClose();
    } catch (reason) {
      setError(keyError(reason));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Enter recovery key</Trans>
          </DialogTitle>
        </DialogHeader>
        <Input
          dir="ltr"
          autoFocus
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="h-11 font-mono"
          placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX-XXXX"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && value.trim()) void unlock();
          }}
          aria-label={t`Recovery key`}
        />
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={busy}>
            <Trans>Cancel</Trans>
          </Button>
          <Button
            onClick={() => void unlock()}
            disabled={busy || !value.trim()}
          >
            <Trans>Unlock</Trans>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ResetDialog({
  profile,
  transport,
  keyId,
  cloudOnlyTales,
  onClose,
  onReset,
}: {
  profile: SyncProfile;
  transport: () => SyncTransport;
  keyId: string | null;
  cloudOnlyTales: number | null;
  onClose: () => void;
  onReset: () => void;
}) {
  const keyError = useKeyErrorMessage();
  const [busy, setBusy] = useState(false);
  async function reset() {
    if (!keyId) return;
    setBusy(true);
    try {
      await resetCloudEncryption({ profile, transport: transport(), keyId });
      onReset();
    } catch (error) {
      toast.error(keyError(error));
      onClose();
    } finally {
      setBusy(false);
    }
  }
  return (
    <AlertDialog open onOpenChange={(open) => !open && !busy && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            <Trans>Reset cloud saves?</Trans>
          </AlertDialogTitle>
          <AlertDialogDescription>
            <Trans>
              All cloud saves are deleted. Tales on this device upload again
              with a new key.
            </Trans>
          </AlertDialogDescription>
          {cloudOnlyTales === null ? (
            <p className="text-sm font-semibold text-destructive">
              <Trans>Cloud tales couldn’t be loaded.</Trans>
            </p>
          ) : cloudOnlyTales > 0 ? (
            <p className="text-sm font-semibold text-destructive">
              {plural(cloudOnlyTales, {
                one: "# cloud tale isn't on this device and will be lost.",
                other: "# cloud tales aren't on this device and will be lost.",
              })}
            </p>
          ) : null}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>
            <Trans>Cancel</Trans>
          </AlertDialogCancel>
          <Button
            variant="destructive"
            onClick={() => void reset()}
            disabled={busy || !keyId || cloudOnlyTales === null}
          >
            <Trans>Reset</Trans>
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function formatCode(code: string) {
  return `${code.slice(0, 3)} ${code.slice(3)}`;
}

function QrCode({ value }: { value: string }) {
  const svg = useMemo(
    () =>
      renderSVG(value, {
        ecc: "M",
        border: 2,
        whiteColor: "#ffffff",
        blackColor: "#000000",
      }),
    [value],
  );
  return (
    <div
      role="img"
      aria-label="QR code"
      className="mx-auto w-full max-w-64 overflow-hidden rounded-xs bg-white [&>svg]:h-auto [&>svg]:w-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}

type PairingStep =
  | { kind: "starting" }
  | { kind: "showing"; qr: string }
  | { kind: "confirm"; code: string; device: string }
  | { kind: "code"; code: string }
  | { kind: "sending" }
  | { kind: "done" }
  | { kind: "failed"; message: string };

function usePairingLifetime() {
  const pairing = useRef<{ id: string; transport: SyncTransport } | null>(null);
  const finished = useRef(false);
  useEffect(
    () => () => {
      const current = pairing.current;
      if (!current) return;
      void cloudKeys.endPairing(current.id).catch(() => undefined);
      if (!finished.current) {
        void cloudPairings
          .cancel(current.transport, current.id)
          .catch(() => undefined);
      }
    },
    [],
  );
  return {
    track: (id: string, transport: SyncTransport) => {
      pairing.current = { id, transport };
    },
    finish: () => {
      finished.current = true;
    },
  };
}

async function waitForPairing(
  transport: SyncTransport,
  id: string,
  ready: (pairing: CloudPairing) => boolean,
  alive: () => boolean,
): Promise<CloudPairing | null> {
  while (alive()) {
    const pairing = await cloudPairings.get(transport, id);
    if (pairing.status === "cancelled") {
      throw new SyncHttpError("Pairing cancelled", 409, "pairing_cancelled");
    }
    if (ready(pairing)) return pairing;
    await new Promise((resolve) => window.setTimeout(resolve, POLL_MS));
  }
  return null;
}

function usePairingError() {
  const { t } = useLingui();
  const keyError = useKeyErrorMessage();
  return (error: unknown) => {
    if (error instanceof SyncHttpError) {
      if (error.code === "pairing_expired" || error.status === 410) {
        return t`This code expired. Show a new one.`;
      }
      if (error.code === "pairing_cancelled") return t`Pairing was cancelled.`;
      if (error.code === "pairing_state_invalid") {
        return t`This code was already used.`;
      }
    }
    return keyError(error);
  };
}

function ShowCodeDialog({
  profile,
  transport,
  direction,
  status,
  onClose,
}: {
  profile: SyncProfile;
  transport: () => SyncTransport;
  direction: PairingDirection;
  status: CloudEncryptionStatus | null;
  onClose: () => void;
}) {
  const pairingError = usePairingError();
  const lifetime = usePairingLifetime();
  const [step, setStep] = useState<PairingStep>({ kind: "starting" });
  const [attempt, setAttempt] = useState(0);
  const confirmRef = useRef<((confirmed: boolean) => void) | null>(null);
  const latest = useLatest({
    profile,
    transport,
    direction,
    keyId: status?.kind === "ready" ? status.session.keyId : null,
    onClose,
    pairingError,
    lifetime,
  });

  useEffect(() => {
    const { profile, transport, direction, keyId, onClose, lifetime } =
      latest.current;
    const scope = cloudKeyScope(profile);
    if (!scope) return;
    let alive = true;
    const connection = transport();
    void (async () => {
      setStep({ kind: "starting" });
      const created = await cloudPairings.create(connection, direction);
      lifetime.track(created.id, connection);
      const qr = await cloudKeys.showPairing(scope, created.id, direction);
      if (!alive) return;
      setStep({ kind: "showing", qr });
      if (direction === "send") {
        if (!keyId) throw new Error("This device is locked");
        const joined = await waitForPairing(
          connection,
          created.id,
          (pairing) => pairing.status === "joined" && Boolean(pairing.scanner),
          () => alive,
        );
        if (!joined?.scanner || !alive) return;
        const code = await cloudKeys.confirmPairing(
          created.id,
          joined.scanner.publicKey,
          joined.scanner.confirm,
        );
        const confirmed = await new Promise<boolean>((resolve) => {
          confirmRef.current = resolve;
          setStep({
            kind: "confirm",
            code,
            device: joined.scanner?.device?.name ?? "",
          });
        });
        if (!confirmed || !alive) {
          onClose();
          return;
        }
        setStep({ kind: "sending" });
        const payload = await cloudKeys.sealPairing(created.id, keyId);
        await cloudPairings.deliver(connection, created.id, payload);
        await waitForPairing(
          connection,
          created.id,
          (pairing) => pairing.status === "completed",
          () => alive,
        );
      } else {
        const delivered = await waitForPairing(
          connection,
          created.id,
          (pairing) =>
            pairing.status === "delivered" &&
            Boolean(pairing.scanner && pairing.payload),
          () => alive,
        );
        if (!delivered?.scanner || !delivered.payload || !alive) return;
        setStep({ kind: "sending" });
        await cloudKeys.confirmPairing(
          created.id,
          delivered.scanner.publicKey,
          delivered.scanner.confirm,
        );
        const info = await fetchCloudKey(connection);
        if (!info.keyId || !info.keyCheck) throw new Error("No cloud key");
        await cloudKeys.openPairing(
          created.id,
          info.keyId,
          info.keyCheck,
          delivered.payload,
        );
        await cloudPairings.complete(connection, created.id);
        settled();
      }
      lifetime.finish();
      if (alive) setStep({ kind: "done" });
    })().catch((error: unknown) => {
      if (alive) {
        setStep({
          kind: "failed",
          message: latest.current.pairingError(error),
        });
      }
    });
    return () => {
      alive = false;
      confirmRef.current?.(false);
    };
  }, [attempt, latest]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {step.kind === "confirm" ? (
              <Trans>Check the code</Trans>
            ) : (
              <Trans>Show a code</Trans>
            )}
          </DialogTitle>
          <DialogDescription>
            {step.kind === "confirm" ? (
              step.device ? (
                <Trans>Make sure {step.device} shows the same code.</Trans>
              ) : (
                <Trans>Make sure the other device shows the same code.</Trans>
              )
            ) : direction === "send" ? (
              <Trans>Scan this code with your phone in Account & Sync.</Trans>
            ) : (
              <Trans>
                Scan this code with an unlocked phone in Account & Sync.
              </Trans>
            )}
          </DialogDescription>
        </DialogHeader>
        <PairingBody step={step} />
        <DialogFooter>
          {step.kind === "failed" ? (
            <Button
              variant="outline"
              onClick={() => setAttempt((value) => value + 1)}
            >
              <Trans>Show a new code</Trans>
            </Button>
          ) : null}
          {step.kind === "confirm" ? (
            <>
              <Button
                variant="outline"
                onClick={() => confirmRef.current?.(false)}
              >
                <Trans>Cancel</Trans>
              </Button>
              <Button onClick={() => confirmRef.current?.(true)}>
                <Trans>Codes match</Trans>
              </Button>
            </>
          ) : (
            <Button
              variant={step.kind === "done" ? "default" : "outline"}
              onClick={onClose}
            >
              {step.kind === "done" ? (
                <Trans>Done</Trans>
              ) : (
                <Trans>Cancel</Trans>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PairingBody({ step }: { step: PairingStep }) {
  switch (step.kind) {
    case "showing":
      return <QrCode value={step.qr} />;
    case "confirm":
    case "code":
      return (
        <p
          dir="ltr"
          className="text-center font-mono text-3xl font-semibold tracking-widest"
        >
          {formatCode(step.code)}
        </p>
      );
    case "done":
      return (
        <p className="text-sm text-success">
          <Trans>Paired</Trans>
        </p>
      );
    case "failed":
      return <p className="text-sm text-destructive">{step.message}</p>;
    default:
      return (
        <p className="text-sm text-muted-foreground">
          <Trans>Working…</Trans>
        </p>
      );
  }
}

async function scanQrCode(): Promise<string | null> {
  const scanner = await import("@tauri-apps/plugin-barcode-scanner");
  let permission = await scanner.checkPermissions();
  if (permission !== "granted") {
    permission = await scanner.requestPermissions();
  }
  if (permission !== "granted") {
    throw new Error("camera_permission_denied");
  }
  const scanned = await scanner.scan({ formats: [scanner.Format.QRCode] });
  return scanned.content || null;
}

function ScanCodeDialog({
  profile,
  transport,
  status,
  onClose,
}: {
  profile: SyncProfile;
  transport: () => SyncTransport;
  status: CloudEncryptionStatus | null;
  onClose: () => void;
}) {
  const { t } = useLingui();
  const pairingError = usePairingError();
  const lifetime = usePairingLifetime();
  const [step, setStep] = useState<PairingStep>({ kind: "starting" });
  const [attempt, setAttempt] = useState(0);
  const latest = useLatest({
    profile,
    transport,
    keyId: status?.kind === "ready" ? status.session.keyId : null,
    onClose,
    pairingError,
    lifetime,
    t,
  });

  useEffect(() => {
    const { profile, transport, keyId, onClose, lifetime, t } = latest.current;
    const scope = cloudKeyScope(profile);
    if (!scope) return;
    let alive = true;
    const connection = transport();
    void (async () => {
      setStep({ kind: "starting" });
      const content = await scanQrCode();
      if (!content || !alive) {
        onClose();
        return;
      }
      const scanned = await cloudKeys.scanPairing(scope, content);
      lifetime.track(scanned.pairingId, connection);
      const join = {
        scannerPublicKey: scanned.scannerPublicKey,
        scannerConfirm: scanned.scannerConfirm,
      };
      if (scanned.direction === "receive") {
        if (!keyId) throw new Error(t`Unlock this device first.`);
        setStep({ kind: "sending" });
        const payload = await cloudKeys.sealPairing(scanned.pairingId, keyId);
        await cloudPairings.join(connection, scanned.pairingId, {
          ...join,
          payload,
        });
        await waitForPairing(
          connection,
          scanned.pairingId,
          (pairing) => pairing.status === "completed",
          () => alive,
        ).catch(() => null);
      } else {
        await cloudPairings.join(connection, scanned.pairingId, join);
        if (!alive) return;
        setStep({ kind: "code", code: scanned.code });
        const delivered = await waitForPairing(
          connection,
          scanned.pairingId,
          (pairing) => Boolean(pairing.payload),
          () => alive,
        );
        if (!delivered?.payload || !alive) return;
        const info = await fetchCloudKey(connection);
        if (!info.keyId || !info.keyCheck) throw new Error("No cloud key");
        await cloudKeys.openPairing(
          scanned.pairingId,
          info.keyId,
          info.keyCheck,
          delivered.payload,
        );
        await cloudPairings.complete(connection, scanned.pairingId);
        settled();
      }
      lifetime.finish();
      if (alive) setStep({ kind: "done" });
    })().catch((error: unknown) => {
      if (!alive) return;
      const { pairingError, t } = latest.current;
      setStep({
        kind: "failed",
        message:
          error instanceof Error && error.message === "camera_permission_denied"
            ? t`Allow camera access to scan codes.`
            : pairingError(error),
      });
    });
    return () => {
      alive = false;
    };
  }, [attempt, latest]);

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>Scan a code</Trans>
          </DialogTitle>
          {step.kind === "code" ? (
            <DialogDescription>
              <Trans>Confirm this code on the other device.</Trans>
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <PairingBody step={step} />
        <DialogFooter>
          {step.kind === "failed" ? (
            <Button
              variant="outline"
              onClick={() => setAttempt((value) => value + 1)}
            >
              <Trans>Scan again</Trans>
            </Button>
          ) : null}
          <Button
            variant={step.kind === "done" ? "default" : "outline"}
            onClick={onClose}
          >
            {step.kind === "done" ? <Trans>Done</Trans> : <Trans>Cancel</Trans>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

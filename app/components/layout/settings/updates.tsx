import { useCallback, useEffect, useRef, useState } from "react";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { getVersion } from "@tauri-apps/api/app";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  AlertCircle,
  CheckCircle2,
  DownloadCloud,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

type UpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "installing"
  | "upToDate"
  | "error"
  | "unsupported";

interface UpdateInfo {
  version: string;
  currentVersion: string;
  releaseDate?: string;
  notes?: string;
}

type TauriWindow = Window & { __TAURI__?: unknown };

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const size = bytes / Math.pow(1024, index);
  return `${size.toFixed(size >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatCheckedAt(date: Date | null) {
  if (!date) return "Never";
  return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
}

export default function SettingsUpdates() {
  const [phase, setPhase] = useState<UpdatePhase>("idle");
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [downloadedBytes, setDownloadedBytes] = useState(0);
  const [updateInfo, setUpdateInfo] = useState<UpdateInfo | null>(null);
  const updateRef = useRef<Update | null>(null);

  useEffect(() => {
    let canceled = false;
    const tauriWindow = window as unknown as TauriWindow;
    const hasTauri =
      typeof window !== "undefined" && "__TAURI_INTERNALS__" in tauriWindow;
    if (!hasTauri) {
      setPhase("unsupported");
      return () => {
        canceled = true;
      };
    }

    getVersion()
      .then((version) => {
        if (!canceled) {
          setCurrentVersion(version);
        }
      })
      .catch(() => {
        if (!canceled) {
          setCurrentVersion(null);
        }
      });

    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    return () => {
      const resource = updateRef.current;
      if (resource) {
        resource.close().catch(() => undefined);
      }
    };
  }, []);

  const handleCheck = useCallback(async () => {
    const tauriWindow = window as unknown as TauriWindow;
    const hasTauri =
      typeof window !== "undefined" && "__TAURI_INTERNALS__" in tauriWindow;
    if (!hasTauri) {
      setPhase("unsupported");
      toast.info("Manual updates are only available in the desktop app.");
      return;
    }

    setPhase("checking");
    setErrorMessage(null);
    setDownloadedBytes(0);

    try {
      const update = await check();
      const now = new Date();
      setCheckedAt(now);

      if (!update) {
        setUpdateInfo(null);
        setPhase("upToDate");
        toast.success("Hakawati is up to date.");
        return;
      }

      await updateRef.current?.close().catch(() => undefined);
      updateRef.current = update;

      setUpdateInfo({
        version: update.version,
        currentVersion: update.currentVersion,
        releaseDate: update.date,
        notes: update.body,
      });

      setPhase("available");
      toast.info(`Update ${update.version} is available.`);
    } catch (error) {
      console.error("Update check failed", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      setErrorMessage(message);
      setPhase("error");
      toast.error("Failed to check for updates.");
    }
  }, []);

  const handleInstall = useCallback(async () => {
    const update = updateRef.current;
    if (!update) {
      return;
    }

    setPhase("installing");
    setErrorMessage(null);
    setDownloadedBytes(0);

    try {
      await update.downloadAndInstall((event) => {
        if (event.event === "Progress") {
          setDownloadedBytes((prev) => prev + (event.data.chunkLength ?? 0));
        }
      });

      toast.success(
        "Update downloaded. The app will relaunch to finish installation.",
      );
      setPhase("idle");
      setUpdateInfo(null);
    } catch (error) {
      console.error("Update install failed", error);
      const message = error instanceof Error ? error.message : "Unknown error";
      setErrorMessage(message);
      setPhase("error");
      toast.error("Failed to install the update.");
    } finally {
      await update.close().catch(() => undefined);
      updateRef.current = null;
    }
  }, []);

  const renderStatus = () => {
    switch (phase) {
      case "checking":
        return (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Checking for updates...
          </div>
        );
      case "available":
        return (
          <div className="flex flex-col gap-2 rounded-sm border border-border/60 bg-card/80 p-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DownloadCloud className="size-4 text-primary" />
                <div className="flex flex-col">
                  <span className="text-sm font-medium">
                    Update {updateInfo?.version} available
                  </span>
                  <span className="text-xs text-muted-foreground">
                    Current version: {updateInfo?.currentVersion ?? "unknown"}
                  </span>
                </div>
              </div>
              <Button size="sm" onClick={handleInstall}>
                Install update
              </Button>
            </div>
            {updateInfo?.notes ? (
              <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {updateInfo.notes}
              </p>
            ) : null}
            {updateInfo?.releaseDate ? (
              <span className="text-xs text-muted-foreground">
                Published{" "}
                {new Date(updateInfo.releaseDate).toLocaleDateString()}
              </span>
            ) : null}
          </div>
        );
      case "installing":
        return (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Downloading update…{" "}
            {downloadedBytes
              ? `(${formatBytes(downloadedBytes)} downloaded)`
              : null}
          </div>
        );
      case "upToDate":
        return (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <CheckCircle2 className="size-4 text-emerald-500" />
            Hakawati is up to date.
          </div>
        );
      case "error":
        return (
          <div className="flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="size-4" />
            {errorMessage ?? "Something went wrong."}
          </div>
        );
      case "unsupported":
        return (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <AlertCircle className="size-4" />
            Desktop-only feature.
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <div className="flex flex-col gap-2">
        <Label>App Updates</Label>
        <Separator />
      </div>

      <div className="flex flex-col gap-2 rounded-sm border border-border/60 bg-card/50 p-3">
        <div className="flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-sm font-medium">Installed version</span>
            <span className="text-xs text-muted-foreground">
              {currentVersion ?? "Detecting..."}
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleCheck}
            disabled={
              phase === "checking" ||
              phase === "installing" ||
              phase === "unsupported"
            }
          >
            {phase === "checking" ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Checking
              </>
            ) : (
              "Check for updates"
            )}
          </Button>
        </div>
        <span className="text-xs text-muted-foreground">
          Last checked: {formatCheckedAt(checkedAt)}
        </span>
      </div>

      {renderStatus()}
    </div>
  );
}

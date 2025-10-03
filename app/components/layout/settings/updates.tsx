import { useEffect, useState } from "react";
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
import { useUpdateStore } from "@/store/useUpdateStore";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);

  // Select state values
  const phase = useUpdateStore((state) => state.phase);
  const checkedAt = useUpdateStore((state) => state.checkedAt);
  const errorMessage = useUpdateStore((state) => state.errorMessage);
  const downloadedBytes = useUpdateStore((state) => state.downloadedBytes);
  const updateInfo = useUpdateStore((state) => state.updateInfo);

  // Select actions separately (these are stable references)
  const checkForUpdates = useUpdateStore((state) => state.checkForUpdates);
  const installUpdate = useUpdateStore((state) => state.installUpdate);
  const markNotificationSeen = useUpdateStore(
    (state) => state.markNotificationSeen,
  );

  useEffect(() => {
    let isActive = true;

    getVersion()
      .then((version) => {
        if (isActive) {
          setCurrentVersion(version);
        }
      })
      .catch(() => {
        if (isActive) {
          setCurrentVersion(null);
        }
      });

    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    markNotificationSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCheck = () => {
    void checkForUpdates();
  };

  const handleInstall = () => {
    void installUpdate();
  };

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
              <div className="prose prose-sm prose-neutral dark:prose-invert max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                  {updateInfo.notes}
                </ReactMarkdown>
              </div>
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

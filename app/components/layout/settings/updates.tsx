import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Loader2 } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@/components/ui/button";
import { useUpdateStore } from "@/store/useUpdateStore";
import { formatBytes } from "@/lib/utils";
import { ReleaseNotes } from "../release-notes";
import { PlainRow, RowText, SetupList, StatusBanner } from "./settings-rows";

export default function SettingsUpdates() {
  const { t, i18n } = useLingui();
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);

  const phase = useUpdateStore((state) => state.phase);
  const checkedAt = useUpdateStore((state) => state.checkedAt);
  const errorMessage = useUpdateStore((state) => state.errorMessage);
  const downloadedBytes = useUpdateStore((state) => state.downloadedBytes);
  const updateInfo = useUpdateStore((state) => state.updateInfo);
  const checkForUpdates = useUpdateStore((state) => state.checkForUpdates);
  const installUpdate = useUpdateStore((state) => state.installUpdate);
  const markNotificationSeen = useUpdateStore(
    (state) => state.markNotificationSeen,
  );

  useEffect(() => {
    let isActive = true;
    getVersion()
      .then((version) => {
        if (isActive) setCurrentVersion(version);
      })
      .catch(() => {
        if (isActive) setCurrentVersion(null);
      });
    return () => {
      isActive = false;
    };
  }, []);

  useEffect(() => {
    markNotificationSeen();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const busy =
    phase === "checking" || phase === "downloading" || phase === "installing";
  const lastChecked = checkedAt
    ? new Intl.DateTimeFormat(i18n.locale, {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(checkedAt)
    : t`Never`;
  const downloaded = downloadedBytes ? formatBytes(downloadedBytes) : null;
  const spinner = <Loader2 className="size-4 animate-spin" />;

  let status = null;
  switch (phase) {
    case "checking":
      status = (
        <StatusBanner
          tone="muted"
          title={<Trans>Checking for updates…</Trans>}
          action={spinner}
        />
      );
      break;
    case "downloading":
      status = (
        <StatusBanner
          tone="muted"
          title={<Trans>Downloading the update…</Trans>}
          detail={downloaded ? <Trans>{downloaded} so far</Trans> : undefined}
          action={spinner}
        />
      );
      break;
    case "installing":
      status = (
        <StatusBanner
          tone="muted"
          title={<Trans>Installing the update…</Trans>}
          action={spinner}
        />
      );
      break;
    case "upToDate":
      status = (
        <StatusBanner
          tone="success"
          title={<Trans>Hakawati is up to date</Trans>}
        />
      );
      break;
    case "error":
      status = (
        <StatusBanner
          tone="destructive"
          title={<Trans>Couldn’t check for updates</Trans>}
          detail={errorMessage ?? undefined}
        />
      );
      break;
    case "unsupported":
      status = (
        <StatusBanner
          tone="muted"
          title={<Trans>Only the desktop app updates itself</Trans>}
        />
      );
      break;
  }

  return (
    <div className="flex flex-col gap-6">
      {phase === "available" && updateInfo ? (
        <div className="flex flex-col gap-3 rounded-xs border border-primary/40 bg-primary/10 p-3.5">
          <div className="flex flex-wrap items-center gap-3">
            <RowText
              title={<Trans>Hakawati {updateInfo.version} is available</Trans>}
              detail={
                updateInfo.releaseDate
                  ? new Intl.DateTimeFormat(i18n.locale, {
                      dateStyle: "medium",
                    }).format(new Date(updateInfo.releaseDate))
                  : undefined
              }
            />
            <Button onClick={() => void installUpdate()}>
              <Trans>Install update</Trans>
            </Button>
          </div>
          {updateInfo.notes ? (
            <ReleaseNotes
              notes={updateInfo.notes}
              className="border-t border-primary/20 pt-4"
            />
          ) : null}
        </div>
      ) : (
        status
      )}

      <SetupList>
        <PlainRow>
          <RowText title={<Trans>Installed version</Trans>} />
          <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
            {currentVersion ?? "…"}
          </span>
        </PlainRow>
        <PlainRow>
          <RowText title={<Trans>Last checked</Trans>} />
          <span className="shrink-0 text-sm text-muted-foreground">
            {lastChecked}
          </span>
        </PlainRow>
      </SetupList>

      <Button
        variant="outline"
        className="self-start"
        onClick={() => void checkForUpdates()}
        disabled={busy || phase === "unsupported"}
      >
        <Trans>Check for updates</Trans>
      </Button>
    </div>
  );
}

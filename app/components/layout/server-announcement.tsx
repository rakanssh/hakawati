import { useEffect, useState, type MouseEvent } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  announcementServerKey,
  announcementText,
  dismissAnnouncement,
  isAnnouncementDismissed,
  type ServerAnnouncement,
} from "@/lib/server-announcement";

export function ServerAnnouncementCard({
  announcement,
  baseUrl,
}: {
  announcement?: ServerAnnouncement | null;
  baseUrl: string;
}) {
  const { t, i18n } = useLingui();
  const [dismissedKey, setDismissedKey] = useState("");
  const [, updateTime] = useState(Date.now);
  const expiry = announcement ? Date.parse(announcement.expiresAt) : null;

  useEffect(() => {
    if (expiry === null) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    function scheduleExpiry() {
      const remaining = expiry! - Date.now();
      if (remaining <= 0) return;
      // Browsers wrap longer timeouts; recheck far-future notices in bounded steps.
      timer = setTimeout(
        () => {
          updateTime(Date.now());
          scheduleExpiry();
        },
        Math.min(remaining, 2_147_483_647),
      );
    }
    scheduleExpiry();
    return () => clearTimeout(timer);
  }, [expiry]);

  const key = JSON.stringify([
    announcementServerKey(baseUrl),
    announcement?.id,
  ]);
  if (
    !announcement ||
    !baseUrl ||
    expiry! <= Date.now() ||
    dismissedKey === key ||
    isAnnouncementDismissed(baseUrl, announcement.id)
  ) {
    return null;
  }
  const text = announcementText(announcement, i18n.locale);

  function openLink(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    void openUrl(event.currentTarget.href).catch(() => {
      toast.error(t`Could not open the link`);
    });
  }

  return (
    <section
      aria-label={t`From Hakawati`}
      className="flex min-w-0 items-start gap-2 rounded-xs border border-border/50 bg-card/30 px-3 py-2"
    >
      <div className="min-w-0 flex-1 text-xs leading-relaxed">
        <div lang={text.lang} dir={text.dir}>
          <h2 className="mb-0.5 break-words font-semibold">{text.title}</h2>
          <p className="inline whitespace-pre-line break-words text-muted-foreground">
            {text.body}
          </p>
          {announcement.url && (
            <>
              {" "}
              <a
                href={announcement.url}
                onClick={openLink}
                className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-4 hover:text-primary/80"
              >
                {announcement.linkLabel ?? <Trans>Learn more</Trans>}
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            </>
          )}
        </div>
      </div>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="-me-1 -mt-1 size-7 shrink-0 text-muted-foreground"
        aria-label={t`Dismiss announcement`}
        onClick={() => {
          dismissAnnouncement(baseUrl, announcement.id);
          setDismissedKey(key);
        }}
      >
        <X className="size-4" aria-hidden="true" />
      </Button>
    </section>
  );
}

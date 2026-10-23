import { useEffect, useState, type MouseEvent } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  AlertTriangle,
  CloudOff,
  ExternalLink,
  Megaphone,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  announcementBodyParts,
  announcementServerKey,
  announcementText,
  dismissAnnouncement,
  isAnnouncementDismissed,
  type AnnouncementKind,
  type ServerAnnouncement,
} from "@/lib/server-announcement";
import { cn } from "@/lib/utils";

// Links take the kind's colour on dark themes; light themes keep text contrast.
const KIND_STYLES: Record<
  AnnouncementKind,
  {
    icon: typeof Megaphone;
    band: string;
    tint: string;
    accent: string;
    link: string;
  }
> = {
  info: {
    icon: Megaphone,
    band: "border-primary/30",
    tint: "bg-primary/10",
    accent: "text-primary",
    link: "text-foreground dark:text-primary",
  },
  warning: {
    icon: AlertTriangle,
    band: "border-warning/40",
    tint: "bg-warning/14",
    accent: "text-warning",
    link: "text-foreground dark:text-warning",
  },
  outage: {
    icon: CloudOff,
    band: "border-destructive/45",
    tint: "bg-destructive/16",
    accent: "text-destructive",
    link: "text-foreground dark:text-destructive",
  },
};

/** The server's notices as a band across the top of Home, one at a time. */
export function ServerAnnouncementBanner({
  announcements,
  baseUrl,
}: {
  announcements?: readonly ServerAnnouncement[] | null;
  baseUrl: string;
}) {
  const { t, i18n } = useLingui();
  const [dismissedKeys, setDismissedKeys] = useState<string[]>([]);
  const [now, setNow] = useState(Date.now);
  const server = announcementServerKey(baseUrl);
  const items = announcements ?? [];
  const nextExpiry = Math.min(
    ...items
      .map((announcement) => Date.parse(announcement.expiresAt))
      .filter((expiry) => expiry > now),
  );

  useEffect(() => {
    if (!Number.isFinite(nextExpiry)) return;
    // Browsers wrap longer timeouts; recheck far-future notices in bounded steps.
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(Math.max(nextExpiry - Date.now(), 0), 2_147_483_647),
    );
    return () => clearTimeout(timer);
  }, [nextExpiry, now]);

  const announcement = baseUrl
    ? items.find(
        (item) =>
          Date.parse(item.expiresAt) > now &&
          !(
            item.dismissible &&
            (dismissedKeys.includes(`${server} ${item.id}`) ||
              isAnnouncementDismissed(baseUrl, item.id))
          ),
      )
    : undefined;
  if (!announcement) return null;

  const text = announcementText(announcement, i18n.locale);
  const style = KIND_STYLES[announcement.kind];
  const Icon = style.icon;

  function openLink(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    void openUrl(event.currentTarget.href).catch(() => {
      toast.error(t`Could not open the link`);
    });
  }

  return (
    <section
      aria-label={t`From Hakawati`}
      data-announcement-kind={announcement.kind}
      className={cn("border-b bg-card", style.band)}
    >
      <div className={style.tint}>
        <div className="mx-auto flex w-full max-w-6xl items-center gap-2.5 px-4 py-1.5 sm:px-6 phone:items-start">
          <Icon
            className={cn("size-4 shrink-0 phone:mt-1", style.accent)}
            aria-hidden="true"
          />
          <div
            lang={text.lang}
            dir={text.dir}
            className="flex min-w-0 flex-1 items-center gap-3 phone:flex-col phone:items-start phone:gap-0"
          >
            <p className="min-w-0 flex-1 whitespace-pre-line break-words py-0.5 text-sm leading-normal text-muted-foreground">
              <strong className="font-semibold text-foreground">
                {text.title}
              </strong>
              {" · "}
              {announcementBodyParts(text.body).map((part, index) =>
                part.url ? (
                  <a
                    key={index}
                    href={part.url}
                    onClick={openLink}
                    className={cn(
                      "font-medium underline underline-offset-4 hover:decoration-2",
                      style.link,
                    )}
                  >
                    {part.text}
                  </a>
                ) : (
                  part.text
                ),
              )}
            </p>
            {announcement.url && (
              <a
                href={announcement.url}
                onClick={openLink}
                className={cn(
                  "inline-flex min-h-7 shrink-0 items-center gap-1.5 text-sm font-semibold underline-offset-4 hover:underline phone:min-h-10",
                  style.link,
                )}
              >
                {text.linkLabel ?? <Trans>Learn more</Trans>}
                <ExternalLink className="size-3.5" aria-hidden="true" />
              </a>
            )}
          </div>
          {announcement.dismissible && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="-me-1.5 size-7 shrink-0 text-muted-foreground phone:-my-1.5 phone:-me-3 phone:size-11"
              aria-label={t`Dismiss announcement`}
              onClick={() => {
                dismissAnnouncement(baseUrl, announcement.id);
                setDismissedKeys((keys) => [
                  ...keys,
                  `${server} ${announcement.id}`,
                ]);
              }}
            >
              <X className="size-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}

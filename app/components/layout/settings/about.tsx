import type { MouseEvent } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Copy, ExternalLink } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { openUrl } from "@tauri-apps/plugin-opener";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "sonner";

const GPL_URL = "https://www.gnu.org/licenses/gpl-3.0.html";
const LICENSES_FOLDER = "LICENSES/";
const SUPPORT_EMAIL = "support@hakawati.net";
const LINK_CLASS =
  "inline-flex items-center gap-1 text-sm font-medium text-primary underline underline-offset-4 hover:text-primary/80";

export default function SettingsAbout() {
  const { t } = useLingui();
  const policyLinks = [
    {
      url: "https://hakawati.dev/terms",
      label: <Trans>Terms of Service</Trans>,
    },
    {
      url: "https://hakawati.dev/privacy",
      label: <Trans>Privacy Policy</Trans>,
    },
    {
      url: "https://hakawati.dev/community-guidelines",
      label: <Trans>Community Guidelines</Trans>,
    },
  ];

  function openExternalLink(event: MouseEvent<HTMLAnchorElement>) {
    event.preventDefault();
    void openUrl(event.currentTarget.href).catch(() => {
      toast.error(t`Could not open the link`);
    });
  }

  async function copyEmailAddress() {
    try {
      await writeText(SUPPORT_EMAIL);
      toast.success(t`Email address copied`);
    } catch {
      toast.error(t`Could not copy the email address`);
    }
  }

  return (
    <div className="flex h-full max-w-full flex-col gap-4">
      <div className="flex flex-col gap-4 pr-2">
        <section className="flex flex-col gap-2 rounded-xs border border-border/60 bg-card/60 p-4">
          <Label>
            <Trans>Support</Trans>
          </Label>
          <p className="text-sm text-muted-foreground">
            <Trans>Questions, problems, or account and privacy requests.</Trans>
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              onClick={openExternalLink}
              className={`${LINK_CLASS} select-all`}
              dir="ltr"
            >
              {SUPPORT_EMAIL}
            </a>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void copyEmailAddress()}
            >
              <Copy className="size-3" aria-hidden="true" />
              <Trans>Copy email address</Trans>
            </Button>
          </div>
        </section>

        <section className="flex flex-col gap-2 rounded-xs border border-border/60 bg-card/60 p-4">
          <Label>
            <Trans>Online services</Trans>
          </Label>
          <p className="text-sm text-muted-foreground">
            <Trans>
              Terms and privacy information for accounts, cloud saves, and the
              public catalog.
            </Trans>
          </p>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {policyLinks.map(({ url, label }) => (
              <a
                key={url}
                href={url}
                target="_blank"
                rel="noreferrer"
                onClick={openExternalLink}
                className={LINK_CLASS}
              >
                {label}
                <ExternalLink className="size-3" aria-hidden="true" />
              </a>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2 rounded-xs border border-border/60 bg-card/60 p-4">
          <Label>
            <Trans>License</Trans>
          </Label>
          <p className="text-sm text-muted-foreground">
            <Trans>
              Hakawati is distributed under the GNU General Public License v3.
            </Trans>
          </p>
          <a
            href={GPL_URL}
            target="_blank"
            rel="noreferrer"
            onClick={openExternalLink}
            className={LINK_CLASS}
          >
            <Trans>View GPLv3 terms</Trans>
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        </section>

        <section className="flex flex-col gap-2 rounded-xs border border-border/60 bg-card/60 p-4">
          <Label>
            <Trans>Third-party dependencies</Trans>
          </Label>
          <p className="text-sm text-muted-foreground">
            <Trans>
              Dependency licenses ship with the application. After installation,
              check the {LICENSES_FOLDER} directory for the generated reports.
            </Trans>
          </p>
        </section>

        <section className="flex flex-col gap-2 rounded-xs border border-border/60 bg-card/60 p-4">
          <Label>
            <Trans>Credits</Trans>
          </Label>
          <p className="text-sm text-muted-foreground">
            <Trans>© 2025 Rakan AlShammari</Trans>
          </p>
        </section>
      </div>
    </div>
  );
}

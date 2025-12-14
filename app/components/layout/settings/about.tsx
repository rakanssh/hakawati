import { Label } from "@/components/ui/label";
import { ExternalLink } from "lucide-react";
import { Trans } from "@lingui/react/macro";

const GPL_URL = "https://www.gnu.org/licenses/gpl-3.0.html";
const LICENSES_FOLDER = "LICENSES/";

export default function SettingsAbout() {
  return (
    <div className="flex h-full max-w-full flex-col gap-4">
      <div className="flex flex-col gap-4 pr-2">
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
            className="inline-flex items-center gap-1 text-sm font-medium text-primary underline underline-offset-4 hover:text-primary/80"
            aria-label="Open Hakawati GPL license"
          >
            <Trans>View GPLv3 terms</Trans>
            <ExternalLink className="size-3" />
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

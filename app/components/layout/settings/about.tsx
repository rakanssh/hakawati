import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { ExternalLink } from "lucide-react";

const GPL_URL = "https://www.gnu.org/licenses/gpl-3.0.html";
const LICENSES_FOLDER = "LICENSES/";
const LICENSING_STATEMENT =
  "Hakawati is distributed under the GNU General Public License v3.";
const COPYRIGHT_NOTICE = "© 2025 Rakan AlShammari";

export default function SettingsAbout() {
  return (
    <div className="flex h-full max-w-2xl flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label>About Hakawati</Label>
        <Separator />
      </div>

      <div className="flex flex-col gap-4 pr-2">
        <section className="flex flex-col gap-2 rounded-sm border border-border/60 bg-card/60 p-4">
          <Label>License</Label>
          <p className="text-sm text-muted-foreground">{LICENSING_STATEMENT}</p>
          <a
            href={GPL_URL}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary underline underline-offset-4 hover:text-primary/80"
            aria-label="Open Hakawati GPL license"
          >
            View GPLv3 terms
            <ExternalLink className="size-3" />
          </a>
        </section>

        <section className="flex flex-col gap-2 rounded-sm border border-border/60 bg-card/60 p-4">
          <Label>Third-party dependencies</Label>
          <p className="text-sm text-muted-foreground">
            Dependency licenses ship with the application. After installation,
            check the {LICENSES_FOLDER} directory for the generated reports.
          </p>
        </section>

        <section className="flex flex-col gap-2 rounded-sm border border-border/60 bg-card/60 p-4">
          <Label>Credits</Label>
          <p className="text-sm text-muted-foreground">{COPYRIGHT_NOTICE}</p>
        </section>
      </div>
    </div>
  );
}

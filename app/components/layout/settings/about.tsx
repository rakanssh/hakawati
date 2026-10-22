import type { MouseEvent, ReactNode } from "react";
import { Copy, ExternalLink } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { openUrl } from "@tauri-apps/plugin-opener";
import { writeText } from "@tauri-apps/plugin-clipboard-manager";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { PlainRow, RowText, SetupList, SetupSection } from "./settings-rows";

const GPL_URL = "https://www.gnu.org/licenses/gpl-3.0.html";
const SUPPORT_EMAIL = "support@hakawati.net";

/** A row that opens a page in the browser. */
function ExternalRow({
  href,
  title,
  onOpen,
}: {
  href: string;
  title: ReactNode;
  onOpen: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      onClick={onOpen}
      className="flex min-h-14 w-full items-center gap-3 border-b border-border/60 px-3.5 py-2.5 text-start transition-colors last:border-b-0 hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none"
    >
      <RowText title={title} />
      <ExternalLink
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground"
      />
    </a>
  );
}

export default function SettingsAbout() {
  const { t } = useLingui();

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
    <div className="flex flex-col gap-6">
      <SetupSection title={<Trans>Support</Trans>}>
        <SetupList>
          <PlainRow className="py-2 pe-2">
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              onClick={openExternalLink}
              dir="ltr"
              className="min-w-0 flex-1 truncate text-sm font-semibold text-primary underline-offset-4 hover:underline"
            >
              {SUPPORT_EMAIL}
            </a>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void copyEmailAddress()}
            >
              <Copy className="size-3.5" aria-hidden="true" />
              <Trans>Copy</Trans>
            </Button>
          </PlainRow>
        </SetupList>
      </SetupSection>

      <SetupSection title={<Trans>Policies</Trans>}>
        <SetupList>
          <ExternalRow
            href="https://hakawati.dev/terms"
            title={<Trans>Terms of Service</Trans>}
            onOpen={openExternalLink}
          />
          <ExternalRow
            href="https://hakawati.dev/privacy"
            title={<Trans>Privacy Policy</Trans>}
            onOpen={openExternalLink}
          />
          <ExternalRow
            href="https://hakawati.dev/community-guidelines"
            title={<Trans>Community Guidelines</Trans>}
            onOpen={openExternalLink}
          />
        </SetupList>
      </SetupSection>

      <SetupSection title={<Trans>License</Trans>}>
        <SetupList>
          <ExternalRow
            href={GPL_URL}
            title={<Trans>GNU General Public License v3</Trans>}
            onOpen={openExternalLink}
          />
          <PlainRow>
            <RowText
              title={<Trans>Third-party licenses</Trans>}
              detail={
                <Trans>In the LICENSES folder that comes with the app</Trans>
              }
            />
          </PlainRow>
        </SetupList>
      </SetupSection>

      <p className="px-0.5 text-xs text-muted-foreground">
        <Trans>© 2025 Rakan AlShammari</Trans>
      </p>
    </div>
  );
}

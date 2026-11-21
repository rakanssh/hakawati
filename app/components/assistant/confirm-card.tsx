import { Trans, useLingui } from "@lingui/react/macro";
import { Button } from "@/components/ui/button";
import { answerAssistantConfirm } from "@/services/assistant/session";
import type { AssistantConfirm } from "@/types/assistant.type";

const SHOWN_NAMES = 5;

export function ConfirmCard({ confirm }: { confirm: AssistantConfirm }) {
  const { t } = useLingui();
  const count = confirm.names.length;
  const [first] = confirm.names;
  const one = count === 1;

  const { title, action, destructive, listsNames } = (() => {
    switch (confirm.action) {
      case "delete_tales":
        return {
          title: one ? t`Delete this tale?` : t`Delete ${count} tales?`,
          action: t`Delete`,
          destructive: true,
          listsNames: true,
        };
      case "delete_scenarios":
        return {
          title: one ? t`Delete this scenario?` : t`Delete ${count} scenarios?`,
          action: t`Delete`,
          destructive: true,
          listsNames: true,
        };
      case "remove_from_cloud":
        return {
          title: t`Remove from cloud?`,
          action: t`Remove from cloud`,
          destructive: false,
          listsNames: true,
        };
      case "keep_local":
        return {
          title: t`Replace the cloud copy of “${first}”?`,
          action: t`Keep This Device`,
          destructive: true,
          listsNames: false,
        };
      case "keep_cloud":
        return {
          title: t`Replace this device's copy of “${first}”?`,
          action: t`Keep Cloud`,
          destructive: true,
          listsNames: false,
        };
      case "unpublish":
        return {
          title: t`Unpublish “${first}”?`,
          action: t`Unpublish`,
          destructive: false,
          listsNames: false,
        };
    }
  })();
  const listed = listsNames ? confirm.names.slice(0, SHOWN_NAMES) : [];
  const more = count - listed.length;

  return (
    <div
      role="alertdialog"
      aria-label={title}
      data-log-entry="confirm"
      className="flex w-full flex-col gap-2 rounded-xs border border-s-2 border-border/60 border-s-destructive/60 bg-card/65 px-3 py-2.5 shadow-sm backdrop-blur-sm"
    >
      <p dir="auto" className="text-sm font-medium text-foreground">
        {title}
      </p>
      {listed.length ? (
        <ul className="list-disc space-y-0.5 ps-5 text-sm text-foreground/85">
          {listed.map((name, index) => (
            <li key={index} dir="auto" className="break-words">
              {name}
            </li>
          ))}
          {more > 0 ? (
            <li className="list-none text-muted-foreground">
              <Trans>and {more} more</Trans>
            </li>
          ) : null}
        </ul>
      ) : null}
      {destructive ? (
        <p className="text-xs text-muted-foreground">
          {t`This can't be undone.`}
        </p>
      ) : null}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => answerAssistantConfirm(false)}
        >
          <Trans>Cancel</Trans>
        </Button>
        <Button
          type="button"
          size="sm"
          variant={destructive ? "destructive" : "default"}
          onClick={() => answerAssistantConfirm(true)}
        >
          {action}
        </Button>
      </div>
    </div>
  );
}

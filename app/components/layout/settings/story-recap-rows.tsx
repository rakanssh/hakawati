import { useId, useState } from "react";
import { ChevronDownIcon } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { NumberInput } from "@/components/ui";
import { MAX_RECAP_SHARE, MIN_RECAP_SHARE } from "@/lib/recaps";
import { cn } from "@/lib/utils";
import {
  isModelRoleConfigured,
  useSettingsStore,
} from "@/store/useSettingsStore";
import { useSettingsModalStore } from "@/store/useSettingsModalStore";
import {
  LinkRow,
  PlainRow,
  RowText,
  ToggleSwitch,
  useRowClass,
} from "./settings-rows";

function RecapShareRows({ fieldClass }: { fieldClass: string }) {
  const { t } = useLingui();
  const rowClass = useRowClass({ interactive: true });
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const recapShare = useSettingsStore((state) => state.recapShare);
  const setRecapShare = useSettingsStore((state) => state.setRecapShare);

  return (
    <>
      <button
        type="button"
        className={rowClass}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen(!open)}
      >
        <RowText title={<Trans>More recap settings</Trans>} />
        <ChevronDownIcon
          aria-hidden="true"
          className={cn(
            "size-4 shrink-0 text-muted-foreground transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      {open ? (
        <div id={panelId} className="contents">
          <PlainRow className="flex-wrap">
            <RowText
              title={<Trans>Space for recaps</Trans>}
              detail={<Trans>Percent of the story history</Trans>}
            />
            <NumberInput
              min={MIN_RECAP_SHARE}
              max={MAX_RECAP_SHARE}
              step={5}
              value={recapShare}
              align="right"
              aria-label={t`Space for recaps`}
              className={fieldClass}
              onValueCommit={setRecapShare}
            />
          </PlainRow>
        </div>
      ) : null}
    </>
  );
}

export function StoryRecapRows({
  advanced = false,
  fieldClass,
}: {
  advanced?: boolean;
  fieldClass: string;
}) {
  const { t } = useLingui();
  const storyRecaps = useSettingsStore((state) => state.storyRecaps);
  const setStoryRecaps = useSettingsStore((state) => state.setStoryRecaps);
  const helperReady = useSettingsStore((state) =>
    isModelRoleConfigured(state.modelRoles.utility),
  );
  const openSettings = useSettingsModalStore((state) => state.openSettings);

  return (
    <>
      <PlainRow>
        <RowText title={<Trans>Story recaps</Trans>} />
        <ToggleSwitch
          checked={storyRecaps}
          onCheckedChange={setStoryRecaps}
          label={t`Story recaps`}
        />
      </PlainRow>
      {storyRecaps && !helperReady ? (
        <LinkRow
          title={<Trans>Set up the Helper for recaps</Trans>}
          onClick={() => openSettings("ai-setup")}
        />
      ) : null}
      {storyRecaps && advanced ? (
        <RecapShareRows fieldClass={fieldClass} />
      ) : null}
    </>
  );
}

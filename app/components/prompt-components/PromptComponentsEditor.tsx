import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { countTokens } from "@/services/llm/tokenCounter";
import {
  PromptComponent,
  PromptComponentType,
  GameMode,
} from "@/types/context.type";
import { PlusIcon, TrashIcon } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";

const COMPONENT_LABELS: Record<PromptComponentType, string> = {
  [PromptComponentType.AI_INSTRUCTIONS]: "AI Instructions",
  [PromptComponentType.PLOT]: "Plot",
  [PromptComponentType.AUTHOR_NOTE]: "Author's Note",
  [PromptComponentType.OPENING]: "Opening Text",
};

const COMPONENT_DESCRIPTIONS: Record<PromptComponentType, string> = {
  [PromptComponentType.AI_INSTRUCTIONS]:
    "Overrides the default AI instructions for this scenario or tale when nonempty.",
  [PromptComponentType.PLOT]:
    "Stable premise and world context sent to the AI.",
  [PromptComponentType.AUTHOR_NOTE]:
    "Style and steering note sent near the end of the prompt.",
  [PromptComponentType.OPENING]:
    "Scenario-only first visible story entry when a new tale starts.",
};

const FIXED_ORDER = [
  PromptComponentType.AI_INSTRUCTIONS,
  PromptComponentType.PLOT,
  PromptComponentType.AUTHOR_NOTE,
  PromptComponentType.OPENING,
];

type PromptComponentsEditorProps = {
  components: PromptComponent[];
  allowedTypes: readonly PromptComponentType[];
  gameMode?: GameMode;
  onAdd: (type: PromptComponentType) => void;
  onUpdate: (id: string, content: string) => void;
  onRemove: (id: string) => void;
};

export function PromptComponentsEditor({
  components,
  allowedTypes,
  gameMode,
  onAdd,
  onUpdate,
  onRemove,
}: PromptComponentsEditorProps) {
  const { t } = useLingui();
  const orderedComponents = [...components].sort(
    (a, b) => FIXED_ORDER.indexOf(a.type) - FIXED_ORDER.indexOf(b.type),
  );
  const missingTypes = allowedTypes.filter(
    (type) => !components.some((component) => component.type === type),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <Label className="text-base">
            <Trans>AI Components</Trans>
          </Label>
          <p className="text-sm text-muted-foreground">
            <Trans>
              These optional components are sent to the AI. The description is
              only shown to you.
            </Trans>
          </p>
          {gameMode === GameMode.GM && (
            <p className="text-xs text-muted-foreground">
              <Trans>
                AI Instructions still apply in Game Master mode; GM mechanics
                and tool behavior are added separately.
              </Trans>
            </p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button size="sm" disabled={missingTypes.length === 0}>
              <PlusIcon className="h-4 w-4" />
              <Trans>Add</Trans>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {missingTypes.map((type) => (
              <DropdownMenuItem key={type} onClick={() => onAdd(type)}>
                {COMPONENT_LABELS[type]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {orderedComponents.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          <Trans>No AI components added.</Trans>
        </p>
      ) : (
        orderedComponents.map((component) => {
          const chars = component.content.length;
          const tokens = countTokens(component.content);
          return (
            <div
              key={component.id}
              className="flex flex-col gap-2 rounded-xs border p-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex flex-col gap-1">
                  <Label>{COMPONENT_LABELS[component.type]}</Label>
                  <span className="text-xs text-muted-foreground">
                    {COMPONENT_DESCRIPTIONS[component.type]}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-muted-foreground">
                    {t`${chars} characters • ~${tokens} tokens`}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8"
                    onClick={() => onRemove(component.id)}
                    aria-label={t`Remove component`}
                  >
                    <TrashIcon className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <Textarea
                value={component.content}
                onChange={(event) => onUpdate(component.id, event.target.value)}
                rows={
                  component.type === PromptComponentType.AI_INSTRUCTIONS ? 8 : 5
                }
              />
            </div>
          );
        })
      )}
    </div>
  );
}

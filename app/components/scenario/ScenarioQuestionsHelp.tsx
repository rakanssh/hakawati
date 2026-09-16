import { useMemo } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Trans } from "@lingui/react/macro";
import { analyzeScenarioQuestions } from "@/lib/scenario-questions";
import type { ScenarioContent } from "@/types/context.type";

export function ScenarioQuestionErrors({
  content,
}: {
  content: ScenarioContent[];
}) {
  const { diagnostics } = useMemo(
    () => analyzeScenarioQuestions(content),
    [content],
  );
  if (!diagnostics.length) return null;
  return (
    <div className="grid gap-1 text-sm text-destructive" role="status">
      <p>
        <Trans>
          Fix these questions before starting or publishing. You can still save
          this draft.
        </Trans>
      </p>
      <ul className="list-inside list-disc">
        {diagnostics.map(({ field, message }, index) => (
          <li key={`${field}-${index}`}>
            {field}: {message}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function ScenarioQuestionsHelp() {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          className="rounded-xs text-xs text-muted-foreground underline decoration-muted-foreground/50 underline-offset-4 hover:text-foreground hover:decoration-foreground focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          <Trans>How to add questions</Trans>
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader className="text-start">
          <DialogTitle>
            <Trans>How to add questions</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Put a question in your scenario text. Players answer before the
              tale starts, and their answers fill in the text.
            </Trans>
          </DialogDescription>
        </DialogHeader>
        <div className="grid min-w-0 gap-3 text-sm">
          <code dir="ltr" className="block break-words text-left">
            {"Your name is ${What is your name?}."}
          </code>
          <code dir="ltr" className="block break-words text-left">
            {"Your job is ${What is your job? | options: Baker, Guard}."}
          </code>
          <p className="text-muted-foreground">
            <Trans>
              Use options: for suggestions, or choices: to require a listed
              answer. Repeat a question to reuse its answer.
            </Trans>
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

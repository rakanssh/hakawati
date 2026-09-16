import { useEffect, useRef, useState, type FormEvent } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { LoaderCircle } from "lucide-react";
import { SuggestedInput } from "@/components/question-input";
import { Button } from "@/components/ui/button";
import {
  getScenarioAnswerError,
  type ScenarioAnswers,
  type ScenarioQuestion,
} from "@/lib/scenario-questions";

type Props = {
  title: string;
  questions: readonly ScenarioQuestion[];
  notice?: string;
  onComplete: (answers: ScenarioAnswers) => Promise<void>;
  onCancel: () => void;
};

export function ScenarioStartWizard({
  title,
  questions,
  notice,
  onComplete,
  onCancel,
}: Props) {
  const { t } = useLingui();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submitLock = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const question = questions[step];
  const value =
    question && Object.hasOwn(answers, question.id) ? answers[question.id] : "";
  const canContinue =
    !question || getScenarioAnswerError(question, value) === null;
  const finalStep = step >= questions.length - 1;
  const questionNumber = step + 1;
  const totalQuestions = questions.length;

  useEffect(() => {
    if (question?.mode === "choices" || !question) heading.current?.focus();
  }, [question]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (submitLock.current || !canContinue) return;
    setError(null);
    if (!finalStep) {
      setStep(step + 1);
      return;
    }
    submitLock.current = true;
    setSubmitting(true);
    try {
      await onComplete(answers);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : t`Failed to start scenario`,
      );
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto flex min-h-full w-full max-w-screen-2xl flex-col px-3 py-4 sm:px-5 lg:px-6">
      <p
        className="truncate text-center text-sm text-muted-foreground"
        title={title}
      >
        {title}
      </p>
      <form
        onSubmit={(event) => void submit(event)}
        className="flex flex-1 flex-col"
      >
        <section className="flex flex-1 items-center justify-center py-8 sm:py-12">
          <div
            key={question?.id ?? "ready"}
            className="grid w-full min-w-0 max-w-3xl grid-cols-1 gap-6 sm:gap-8"
          >
            {notice && (
              <p
                role="status"
                className="text-center text-sm text-muted-foreground"
              >
                {notice}
              </p>
            )}
            <h1
              ref={heading}
              tabIndex={-1}
              className="break-words text-balance text-center text-2xl font-semibold leading-tight outline-none sm:text-3xl lg:text-4xl"
            >
              {question?.question ?? <Trans>Ready to start your tale?</Trans>}
            </h1>
            {question && (
              <SuggestedInput
                id="scenario-answer"
                value={value}
                placeholder={t`Your answer`}
                aria-label={question.question}
                disabled={submitting}
                allowCustom={question.mode !== "choices"}
                optionColumns="grid-cols-[repeat(auto-fit,minmax(min(100%,14rem),1fr))]"
                suggestions={question.options.map((option) => ({
                  id: option,
                  label: option,
                }))}
                selectedId={question.options.includes(value) ? value : null}
                onValueChange={(answer) =>
                  setAnswers((current) => ({
                    ...current,
                    [question.id]: answer,
                  }))
                }
                onSuggestionSelect={(option) =>
                  setAnswers((current) => ({
                    ...current,
                    [question.id]: option.label,
                  }))
                }
              />
            )}
            {error && (
              <p
                role="alert"
                className="break-words text-center text-sm text-destructive"
              >
                {error}
              </p>
            )}
          </div>
        </section>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
          <Button
            type="button"
            variant="ghost"
            disabled={submitting}
            onClick={onCancel}
          >
            <Trans>Cancel</Trans>
          </Button>
          {totalQuestions > 1 && (
            <div className="order-first flex w-full min-w-0 items-center gap-3 sm:order-none sm:w-auto sm:flex-1">
              <span
                aria-hidden="true"
                className="shrink-0 text-xs tabular-nums text-muted-foreground"
              >
                {questionNumber} / {totalQuestions}
              </span>
              <div
                role="progressbar"
                className="h-1 flex-1 overflow-hidden rounded-full bg-muted"
                aria-label={t`Question progress`}
                aria-valuemin={0}
                aria-valuenow={questionNumber}
                aria-valuemax={totalQuestions}
                aria-valuetext={t`Question ${questionNumber} of ${totalQuestions}`}
              >
                <div
                  className="h-full bg-primary/75 transition-all"
                  style={{
                    width: `${(questionNumber / totalQuestions) * 100}%`,
                  }}
                />
              </div>
            </div>
          )}
          <div className="ms-auto flex max-w-full flex-wrap justify-end gap-2">
            {step > 0 && (
              <Button
                type="button"
                variant="outline"
                disabled={submitting}
                onClick={() => {
                  setError(null);
                  setStep(step - 1);
                }}
              >
                <Trans>Back</Trans>
              </Button>
            )}
            <Button
              type="submit"
              className="h-auto min-h-9 max-w-full whitespace-normal"
              disabled={submitting || !canContinue}
            >
              {submitting ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  <Trans>Starting tale...</Trans>
                </>
              ) : finalStep ? (
                <Trans>Start Tale</Trans>
              ) : (
                <Trans>Next</Trans>
              )}
            </Button>
          </div>
        </footer>
      </form>
    </main>
  );
}

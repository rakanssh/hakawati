import { useEffect, useRef, useState, type FormEvent } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { ArrowLeftIcon, LoaderCircle, PlayIcon } from "lucide-react";
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
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 px-3 py-6 sm:px-5 sm:py-10 lg:px-6">
      <header className="grid gap-3 text-center">
        <p className="break-words text-sm text-muted-foreground">{title}</p>
        <h1 className="text-2xl font-semibold sm:text-3xl">
          <Trans>Customize your tale</Trans>
        </h1>
        {totalQuestions > 0 && (
          <>
            <p className="text-sm text-muted-foreground" aria-live="polite">
              <Trans>
                Question {questionNumber} of {totalQuestions}
              </Trans>
            </p>
            <div
              role="progressbar"
              className="mx-auto h-1.5 w-full max-w-sm overflow-hidden rounded-full bg-muted"
              aria-label={t`Question progress`}
              aria-valuemin={0}
              aria-valuenow={questionNumber}
              aria-valuemax={totalQuestions}
            >
              <div
                className="h-full bg-primary/75 transition-all"
                style={{ width: `${(questionNumber / totalQuestions) * 100}%` }}
              />
            </div>
          </>
        )}
      </header>
      {notice && (
        <p role="status" className="rounded-xs border bg-muted/30 p-4 text-sm">
          {notice}
        </p>
      )}
      <form onSubmit={(event) => void submit(event)} className="grid gap-8">
        <section key={question?.id ?? "ready"} className="grid gap-6 py-4">
          <h2
            ref={heading}
            tabIndex={-1}
            className="break-words text-center text-xl font-medium outline-none sm:text-2xl"
          >
            {question?.question ?? <Trans>Ready to start your tale?</Trans>}
          </h2>
          {question && (
            <SuggestedInput
              id="scenario-answer"
              value={value}
              placeholder={t`Your answer`}
              aria-label={question.question}
              aria-describedby="scenario-answer-hint"
              disabled={submitting}
              allowCustom={question.mode !== "choices"}
              suggestions={question.options.map((option) => ({
                id: option,
                label: option,
              }))}
              selectedId={question.options.includes(value) ? value : null}
              onValueChange={(answer) =>
                setAnswers((current) => ({ ...current, [question.id]: answer }))
              }
              onSuggestionSelect={(option) =>
                setAnswers((current) => ({
                  ...current,
                  [question.id]: option.label,
                }))
              }
            />
          )}
          {question && (
            <p
              id="scenario-answer-hint"
              className="text-center text-sm text-muted-foreground"
            >
              <Trans>Answer this question to continue.</Trans>
            </p>
          )}
        </section>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t pt-5 pb-4">
          <Button
            type="button"
            variant="ghost"
            disabled={submitting}
            onClick={onCancel}
          >
            <Trans>Cancel</Trans>
          </Button>
          <div className="flex gap-2">
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
                <ArrowLeftIcon className="size-4 rtl:rotate-180" />
                <Trans>Back</Trans>
              </Button>
            )}
            <Button type="submit" disabled={submitting || !canContinue}>
              {submitting ? (
                <>
                  <LoaderCircle className="size-4 animate-spin" />
                  <Trans>Starting tale...</Trans>
                </>
              ) : finalStep ? (
                <>
                  <PlayIcon className="size-4" />
                  <Trans>Start Tale</Trans>
                </>
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

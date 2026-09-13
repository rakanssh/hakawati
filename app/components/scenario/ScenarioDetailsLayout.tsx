import { useEffect, useId, useState, type ReactNode } from "react";
import { Trans } from "@lingui/react/macro";
import { ArrowLeftIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

type ScenarioDetailsLayoutProps = {
  breadcrumb: ReactNode;
  title: ReactNode;
  imageSrc: string;
  imageAlt: string;
  byline?: ReactNode;
  meta?: ReactNode;
  tags?: ReactNode;
  notice?: ReactNode;
  headerAction?: ReactNode;
  actions: ReactNode;
  summary: ReactNode;
  children?: ReactNode;
  backLabel: string;
  onBack: () => void;
};

export function ScenarioDetailsLayout({
  breadcrumb,
  title,
  imageSrc,
  imageAlt,
  byline,
  meta,
  tags,
  notice,
  headerAction,
  actions,
  summary,
  children,
  backLabel,
  onBack,
}: ScenarioDetailsLayoutProps) {
  const summaryId = useId();
  const [expanded, setExpanded] = useState(false);
  const canExpandSummary =
    typeof summary === "string" &&
    (summary.length > 320 || summary.split("\n").length > 4);

  useEffect(() => setExpanded(false), [summary]);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-3 py-4 sm:px-5 sm:py-6 lg:gap-8 lg:px-6">
      <header className="flex min-w-0 items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={onBack}
            aria-label={backLabel}
          >
            <ArrowLeftIcon className="size-4 rtl:rotate-180" />
          </Button>
          <div className="min-w-0">{breadcrumb}</div>
        </div>
        {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
      </header>

      <Separator />

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(13rem,18rem)] md:items-start lg:gap-10">
        <section className="grid min-w-0 gap-5 md:py-2">
          <div className="grid gap-3">
            {tags ? <div className="flex flex-wrap gap-1.5">{tags}</div> : null}
            <h1 className="break-words text-3xl font-semibold leading-tight text-balance sm:text-4xl">
              {title}
            </h1>
            {byline ? (
              <div className="text-sm text-muted-foreground">{byline}</div>
            ) : null}
          </div>
          <div className="grid gap-2">
            <div
              id={summaryId}
              className={`max-w-[65ch] whitespace-pre-wrap break-words text-base leading-relaxed text-muted-foreground ${canExpandSummary && !expanded ? "line-clamp-4" : ""}`}
            >
              {summary}
            </div>
            {canExpandSummary ? (
              <Button
                variant="link"
                className="h-auto justify-self-start p-0 text-sm"
                aria-expanded={expanded}
                aria-controls={summaryId}
                onClick={() => setExpanded((value) => !value)}
              >
                {expanded ? (
                  <Trans>Show less</Trans>
                ) : (
                  <Trans>Read full description</Trans>
                )}
              </Button>
            ) : null}
          </div>
          {notice}
          {actions}
        </section>

        <div className="overflow-hidden rounded-xs border bg-muted/20">
          <img
            src={imageSrc}
            alt={imageAlt}
            className="aspect-[16/7] w-full object-cover md:aspect-[4/3]"
          />
        </div>
      </div>

      {children}

      {meta ? (
        <section className="grid gap-3 border-t pt-5">
          <h2 className="text-sm font-medium">
            <Trans>Scenario details</Trans>
          </h2>
          <div className="flex flex-wrap gap-x-4 gap-y-2 text-sm text-muted-foreground">
            {meta}
          </div>
        </section>
      ) : null}
    </main>
  );
}

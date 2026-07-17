import type { ReactNode } from "react";
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
  summaryHeading: ReactNode;
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
  summaryHeading,
  backLabel,
  onBack,
}: ScenarioDetailsLayoutProps) {
  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-3 py-4 sm:px-5 sm:py-6 lg:px-6">
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
          <div className="min-w-0 truncate text-sm text-muted-foreground">
            {breadcrumb}
          </div>
        </div>
        {headerAction ? <div className="shrink-0">{headerAction}</div> : null}
      </header>

      <Separator />

      <main className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(15rem,20rem)] md:items-start lg:gap-8">
        <section className="grid min-w-0 gap-4 md:py-2">
          <div className="grid gap-1.5">
            <h1 className="text-[1.375rem] font-semibold leading-tight text-balance sm:text-[1.75rem] lg:text-[2rem]">
              {title}
            </h1>
            {byline ? (
              <div className="text-sm text-muted-foreground">{byline}</div>
            ) : null}
          </div>
          {meta ? (
            <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {meta}
            </div>
          ) : null}
          {tags ? <div className="flex flex-wrap gap-1.5">{tags}</div> : null}
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
      </main>

      <section className="grid gap-3 border-t pt-5 sm:pt-6">
        <h2 className="text-xl font-semibold">{summaryHeading}</h2>
        <div className="max-w-[70ch] whitespace-pre-wrap text-base leading-relaxed text-muted-foreground">
          {summary}
        </div>
      </section>
    </div>
  );
}

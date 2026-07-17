import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";

import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type ScenarioPreviewCardProps = {
  title: string;
  summary: string;
  imageSrc: string;
  imageAlt: string;
  ariaLabel: string;
  meta?: ReactNode;
  footer?: ReactNode;
  imageBadges?: ReactNode;
  menu?: ReactNode;
  variant?: "shelf" | "grid";
  disabled?: boolean;
  onOpen: () => void;
};

export function ScenarioPreviewCard({
  title,
  summary,
  imageSrc,
  imageAlt,
  ariaLabel,
  meta,
  footer,
  imageBadges,
  menu,
  variant = "grid",
  disabled = false,
  onOpen,
}: ScenarioPreviewCardProps) {
  const summarySlotRef = useRef<HTMLDivElement>(null);
  const summaryRef = useRef<HTMLParagraphElement>(null);
  const [summaryLines, setSummaryLines] = useState(4);
  const hasFooter = Boolean(footer || meta);

  useEffect(() => {
    const summarySlot = summarySlotRef.current;
    const summaryText = summaryRef.current;
    if (!summarySlot || !summaryText) return;

    const updateSummaryLines = () => {
      const lineHeight = Number.parseFloat(
        window.getComputedStyle(summaryText).lineHeight,
      );
      if (!Number.isFinite(lineHeight) || lineHeight <= 0) return;

      const availableHeight = summarySlot.getBoundingClientRect().height;
      const nextLines = Math.max(
        1,
        Math.floor((availableHeight + 0.5) / lineHeight),
      );
      setSummaryLines((current) =>
        current === nextLines ? current : nextLines,
      );
    };

    updateSummaryLines();
    const resizeObserver =
      typeof ResizeObserver === "undefined"
        ? null
        : new ResizeObserver(updateSummaryLines);
    resizeObserver?.observe(summarySlot);
    window.addEventListener("resize", updateSummaryLines);

    return () => {
      resizeObserver?.disconnect();
      window.removeEventListener("resize", updateSummaryLines);
    };
  }, []);

  const open = () => {
    if (!disabled) onOpen();
  };

  return (
    <Card
      role="button"
      tabIndex={disabled ? -1 : 0}
      onClick={open}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.currentTarget !== event.target) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          open();
        }
      }}
      className={cn(
        "group grid cursor-pointer gap-0 overflow-hidden border-accent/50 p-0 transition-[border-color,background-color] hover:border-accent hover:bg-card/80 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        disabled &&
          "cursor-not-allowed opacity-60 hover:border-accent/50 hover:bg-card",
        variant === "shelf"
          ? "h-40 w-[78vw] max-w-72 shrink-0 snap-start grid-cols-[6.5rem_minmax(0,1fr)]"
          : "h-48 grid-cols-[7.5rem_minmax(0,1fr)] sm:grid-cols-[9rem_minmax(0,1fr)]",
      )}
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
    >
      <div className="relative min-h-0 overflow-hidden border-r border-border/70 rtl:border-r-0 rtl:border-l">
        <img
          src={imageSrc}
          alt={imageAlt}
          className="h-full w-full object-cover"
        />
        {menu ? (
          <div
            className="absolute right-1.5 top-1.5 z-10 rtl:right-auto rtl:left-1.5"
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => event.stopPropagation()}
          >
            {menu}
          </div>
        ) : null}
        {imageBadges ? (
          <div className="absolute inset-x-1.5 bottom-1.5 z-10 flex min-w-0 flex-wrap items-end gap-1">
            {imageBadges}
          </div>
        ) : null}
      </div>
      <CardContent
        className={cn(
          "grid min-h-0 min-w-0 gap-2 overflow-hidden p-3",
          hasFooter
            ? "grid-rows-[auto_minmax(0,1fr)_auto]"
            : "grid-rows-[auto_minmax(0,1fr)]",
        )}
      >
        <div className="flex min-w-0 shrink-0 items-start gap-2">
          <h3 className="line-clamp-2 min-w-0 flex-1 text-[0.9375rem] font-semibold leading-snug">
            {title}
          </h3>
          <ChevronRight className="mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5" />
        </div>
        <div
          ref={summarySlotRef}
          className="min-h-0 overflow-hidden"
          data-preview-summary-slot
        >
          <p
            ref={summaryRef}
            className="line-clamp-4 text-sm leading-normal text-muted-foreground"
            style={{ WebkitLineClamp: summaryLines }}
          >
            {summary}
          </p>
        </div>
        {hasFooter ? (
          <div className="grid min-w-0 shrink-0 gap-1.5">
            {footer ? <div className="min-w-0">{footer}</div> : null}
            {meta ? (
              <div className="truncate text-xs text-muted-foreground">
                {meta}
              </div>
            ) : null}
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

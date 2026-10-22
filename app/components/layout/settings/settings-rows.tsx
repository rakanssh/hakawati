import type { ComponentProps, ReactNode } from "react";
import { CheckIcon, ChevronRightIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSettingsWindow } from "./settings-shell";

/** Grouped rows for settings pages: a heading over a framed list. */
export function SetupSection({
  title,
  children,
  className,
}: {
  title: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-2", className)}>
      <h3
        data-sidebar-heading=""
        className="px-0.5 text-xs font-semibold text-muted-foreground"
      >
        {title}
      </h3>
      {children}
    </section>
  );
}

export function SetupList({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn(
        "flex flex-col overflow-hidden rounded-xs border border-border/70 bg-background/60",
        className,
      )}
      {...props}
    />
  );
}

/** A settings row's frame: sized for a finger, or denser in the desktop settings window. */
export function useRowClass({ interactive = false } = {}) {
  const windowed = useSettingsWindow();
  return cn(
    "flex w-full items-center gap-3 border-b border-border/60 px-3.5 text-start last:border-b-0",
    windowed ? "min-h-11 py-1.5" : "min-h-14 py-2.5",
    interactive &&
      "transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-60",
  );
}

export function RowText({
  title,
  detail,
  detailClassName,
}: {
  title: ReactNode;
  detail?: ReactNode;
  detailClassName?: string;
}) {
  return (
    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
      <span className="truncate text-sm font-semibold">{title}</span>
      {detail ? (
        <span
          className={cn(
            "line-clamp-2 text-[0.8rem] text-muted-foreground",
            detailClassName,
          )}
        >
          {detail}
        </span>
      ) : null}
    </span>
  );
}

/** A row that opens another page. */
export function LinkRow({
  leading,
  title,
  detail,
  detailClassName,
  trailing,
  className,
  ...props
}: Omit<ComponentProps<"button">, "title"> & {
  leading?: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  detailClassName?: string;
  trailing?: ReactNode;
}) {
  const rowClass = useRowClass({ interactive: true });
  return (
    <button type="button" className={cn(rowClass, className)} {...props}>
      {leading}
      <RowText
        title={title}
        detail={detail}
        detailClassName={detailClassName}
      />
      {trailing}
      <ChevronRightIcon
        aria-hidden="true"
        className="size-4 shrink-0 text-muted-foreground rtl:rotate-180"
      />
    </button>
  );
}

export function RadioRow({
  leading,
  title,
  detail,
  checked,
  className,
  ...props
}: Omit<ComponentProps<"button">, "title"> & {
  leading?: ReactNode;
  title: ReactNode;
  detail?: ReactNode;
  checked: boolean;
}) {
  const rowClass = useRowClass({ interactive: true });
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      className={cn(rowClass, checked && "bg-primary/10", className)}
      {...props}
    >
      {leading}
      <RowText title={title} detail={detail} />
      {checked && (
        <CheckIcon
          aria-hidden="true"
          className="size-4 shrink-0 text-primary"
        />
      )}
    </button>
  );
}

export function PlainRow({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const rowClass = useRowClass();
  return <div className={cn(rowClass, className)}>{children}</div>;
}

/**
 * A row with its label above a control that needs the full width. The desktop
 * settings window has room for both on one line.
 */
export function BlockRow({
  title,
  children,
}: {
  title: ReactNode;
  children: ReactNode;
}) {
  const windowed = useSettingsWindow();
  return (
    <div
      className={cn(
        "flex border-b border-border/60 px-3.5 last:border-b-0",
        windowed
          ? "min-h-11 flex-wrap items-center gap-x-4 gap-y-2 py-1.5"
          : "flex-col gap-2 py-3",
      )}
    >
      <span className={cn("text-sm font-semibold", windowed && "flex-1")}>
        {title}
      </span>
      {children}
    </div>
  );
}

export function StatusBanner({
  tone,
  title,
  detail,
  action,
}: {
  tone: "success" | "destructive" | "muted";
  title: ReactNode;
  detail?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div
      role="status"
      className={cn(
        "flex items-center gap-3 border px-3.5 py-3",
        tone === "success" && "border-success/40 bg-success/10",
        tone === "destructive" &&
          "border-destructive/40 bg-destructive/10 text-destructive",
        tone === "muted" && "border-border/70 bg-muted/40",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-2.5 shrink-0 rounded-full",
          tone === "success" && "bg-success",
          tone === "destructive" && "bg-destructive",
          tone === "muted" && "bg-muted-foreground/60",
        )}
      />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-sm font-semibold">{title}</span>
        {detail ? (
          <span className="line-clamp-3 break-words text-[0.8rem] opacity-90">
            {detail}
          </span>
        ) : null}
      </span>
      {action}
    </div>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  fill,
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  /** Spreads the options evenly across the full width, except in the desktop settings window. */
  fill?: boolean;
}) {
  const windowed = useSettingsWindow();
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        "rounded-xs border bg-muted/40 p-0.5",
        fill && !windowed
          ? "grid w-full auto-cols-fr grid-flow-col"
          : "inline-flex w-fit max-w-full flex-wrap",
      )}
    >
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={cn(
            "rounded-[calc(var(--radius)-6px)] px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === option.value && "bg-background text-foreground shadow-sm",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function ToggleSwitch({
  checked,
  onCheckedChange,
  label,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "inline-flex h-7 w-12 shrink-0 items-center rounded-xs border p-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
        checked ? "border-primary bg-primary" : "border-border bg-muted",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "size-5.5 rounded-[1px] bg-background shadow-sm transition-transform",
          checked && "translate-x-5 rtl:-translate-x-5",
        )}
      />
    </button>
  );
}

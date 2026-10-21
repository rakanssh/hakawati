import type { ComponentProps, ReactNode } from "react";
import { Trans } from "@lingui/react/macro";
import { useLingui as useLinguiCore } from "@lingui/react";
import {
  BookOpenIcon,
  CheckIcon,
  ChevronRightIcon,
  GlobeIcon,
  MicIcon,
  ServerIcon,
  Volume2Icon,
  WandSparklesIcon,
} from "lucide-react";
import { apiPresetMap } from "@/data/api-presets";
import { cn } from "@/lib/utils";
import { useSettingsStore } from "@/store/useSettingsStore";
import { ApiConnection, ApiPreset, type ModelRole } from "@/types";

export function RoleName({ role }: { role: ModelRole }) {
  switch (role) {
    case "narrator":
      return <Trans>Narrator</Trans>;
    case "utility":
      return <Trans>Helper</Trans>;
    case "speechToText":
      return <Trans>Speech to Text</Trans>;
    case "textToSpeech":
      return <Trans>Text to Speech</Trans>;
  }
}

const ROLE_ICONS = {
  narrator: BookOpenIcon,
  utility: WandSparklesIcon,
  speechToText: MicIcon,
  textToSpeech: Volume2Icon,
} as const;

export function RoleIcon({ role, off }: { role: ModelRole; off?: boolean }) {
  const Icon = ROLE_ICONS[role];
  return (
    <span
      className={cn(
        "flex size-9 shrink-0 items-center justify-center rounded-xs",
        off ? "bg-muted text-muted-foreground" : "bg-primary/15 text-primary",
      )}
    >
      <Icon className="size-4" aria-hidden="true" />
    </span>
  );
}

const MONOGRAMS: Partial<Record<ApiPreset, string>> = {
  [ApiPreset.CHATGPT]: "GPT",
  [ApiPreset.OPENROUTER]: "OR",
  [ApiPreset.OPENAI]: "AI",
  [ApiPreset.NANOGPT]: "NG",
};

export function ProviderBadge({ preset }: { preset: ApiPreset }) {
  const monogram = MONOGRAMS[preset];
  const Icon = preset === ApiPreset.LOCAL ? ServerIcon : GlobeIcon;
  return (
    <span
      aria-hidden="true"
      className="flex size-9 shrink-0 items-center justify-center rounded-xs bg-primary/15 text-[0.7rem] font-bold tracking-wide text-primary"
    >
      {monogram ?? <Icon className="size-4" />}
    </span>
  );
}

function hostOf(baseUrl: string) {
  try {
    return new URL(baseUrl).host;
  } catch {
    return baseUrl.trim();
  }
}

export function keyTail(apiKey: string) {
  return apiKey.trim().slice(-4);
}

/** Names connections, telling apart two saved for the same provider. */
export function useConnectionNames() {
  const { _ } = useLinguiCore();
  const connections = useSettingsStore((state) => state.connections);
  const base = (connection: ApiConnection) => {
    if (connection.label) return connection.label;
    const preset = apiPresetMap[connection.preset];
    if (preset.editableUrl && connection.baseUrl) {
      return hostOf(connection.baseUrl);
    }
    return _(preset.label);
  };
  return (connection: ApiConnection) => {
    const name = base(connection);
    const twin = connections.some(
      (other) => other.id !== connection.id && base(other) === name,
    );
    return twin && connection.apiKey
      ? `${name} · ${keyTail(connection.apiKey)}`
      : name;
  };
}

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

const rowClass =
  "flex min-h-14 w-full items-center gap-3 border-b border-border/60 px-3.5 py-2.5 text-start last:border-b-0";
const interactiveRowClass =
  "transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-60";

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
  return (
    <button
      type="button"
      className={cn(rowClass, interactiveRowClass, className)}
      {...props}
    >
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
  return (
    <button
      type="button"
      role="radio"
      aria-checked={checked}
      className={cn(
        rowClass,
        interactiveRowClass,
        checked && "bg-primary/10",
        className,
      )}
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
  return <div className={cn(rowClass, className)}>{children}</div>;
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
}: {
  label: string;
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex w-fit max-w-full flex-wrap rounded-xs border bg-muted/40 p-0.5"
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

import { useMemo, useState } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { CheckIcon, RefreshCwIcon, SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { useLLMProviders } from "@/hooks/useLLMProviders";
import type { LLMModel } from "@/services/llm/schema";
import { manualModel, useChooseModel } from "@/hooks/useChooseModel";
import { useSettingsStore } from "@/store/useSettingsStore";
import { ApiPreset, type ModelRole } from "@/types";
import { getModelMetaLabels } from "../../model-select-meta";
import {
  PlainRow,
  SetupList,
  StatusBanner,
  useRowClass,
} from "../settings-rows";

type Providers = ReturnType<typeof useLLMProviders>;
type Filter = "all" | "tools" | "free" | "long";

const LONG_CONTEXT = 128_000;

function perMillion(value: unknown): number | undefined {
  const n = typeof value === "string" ? parseFloat(value) : Number(value);
  return Number.isFinite(n) && n >= 0 ? n * 1_000_000 : undefined;
}

function isFree(model: LLMModel) {
  return (
    perMillion(model.pricing?.prompt) === 0 &&
    perMillion(model.pricing?.completion) === 0
  );
}

const isSpeechRole = (role: ModelRole) =>
  role === "speechToText" || role === "textToSpeech";

/** One line about a model: its context, then prices or what it can do. */
export function useDescribeModel(role: ModelRole) {
  const { t, i18n } = useLingui();
  const compact = new Intl.NumberFormat(i18n.locale, {
    notation: "compact",
    maximumFractionDigits: 1,
  });
  const usd = new Intl.NumberFormat(i18n.locale, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });

  return (model: LLMModel, detail: "prices" | "abilities") => {
    if (isSpeechRole(role)) return getModelMetaLabels(model, role).join(" · ");
    const parts: string[] = [];
    if (model.contextLength) {
      const size = compact.format(model.contextLength);
      parts.push(t`${size} context`);
    }
    if (detail === "abilities") {
      if (role === "narrator" && model.supportsToolCalls) {
        parts.push(t`can use tools`);
      }
    } else if (isFree(model)) {
      parts.push(t`Free`);
    } else {
      const input = perMillion(model.pricing?.prompt);
      const output = perMillion(model.pricing?.completion);
      if (input !== undefined && output !== undefined) {
        const inPrice = usd.format(input);
        const outPrice = usd.format(output);
        parts.push(t`${inPrice} in · ${outPrice} out per million`);
      }
    }
    return parts.join(" · ");
  };
}

export function ModelPicker({
  role,
  providers,
  onPicked,
  listClassName,
}: {
  role: ModelRole;
  providers: Providers;
  onPicked: () => void;
  /** Bounds the list, so it scrolls inside a dropdown. */
  listClassName?: string;
}) {
  const { t } = useLingui();
  const { models, loading, error, refresh } = providers;
  const config = useSettingsStore((state) => state.modelRoles[role]);
  const chooseModel = useChooseModel(role);
  const describe = useDescribeModel(role);
  const rowClass = useRowClass({ interactive: true });
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [manualId, setManualId] = useState<string | null>(null);
  const isChatGpt = config.activePreset === ApiPreset.CHATGPT;

  const filters = useMemo(() => {
    const options: { value: Filter; label: string }[] = [];
    const some = (test: (m: LLMModel) => boolean) =>
      models.some(test) && !models.every(test);
    if (role === "narrator" && some((m) => Boolean(m.supportsToolCalls))) {
      options.push({ value: "tools", label: t`Can use tools` });
    }
    if (some(isFree)) options.push({ value: "free", label: t`Free` });
    if (some((m) => (m.contextLength ?? 0) >= LONG_CONTEXT)) {
      options.push({ value: "long", label: t`Long context` });
    }
    return options.length > 0
      ? [{ value: "all" as const, label: t`All` }, ...options]
      : [];
  }, [models, role, t]);

  const visible = useMemo(() => {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    return models.filter((model) => {
      if (filter === "tools" && !model.supportsToolCalls) return false;
      if (filter === "free" && !isFree(model)) return false;
      if (filter === "long" && (model.contextLength ?? 0) < LONG_CONTEXT)
        return false;
      const text = `${model.name} ${model.id}`.toLowerCase();
      return words.every((word) => text.includes(word));
    });
  }, [filter, models, query]);

  function pick(model: LLMModel) {
    chooseModel(model);
    onPicked();
  }

  function applyManualId() {
    const id = manualId?.trim();
    if (id) pick(manualModel(id));
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <label className="relative min-w-0 flex-1">
          <SearchIcon
            aria-hidden="true"
            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          />
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t`Search models`}
            aria-label={t`Search models`}
            className="h-11 ps-9"
          />
        </label>
        <Button
          variant="outline"
          size="icon"
          className="size-11 shrink-0"
          onClick={refresh}
          disabled={loading}
          aria-label={t`Refresh models`}
        >
          <RefreshCwIcon className={cn("size-4", loading && "animate-spin")} />
        </Button>
      </div>

      {filters.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
              className={cn(
                "sidebar-chip h-8 rounded-xs border px-3 text-[0.8rem] transition-colors",
                filter === option.value
                  ? "border-primary/55 bg-primary/15 font-semibold text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {error && (
        <StatusBanner
          tone="destructive"
          title={<Trans>Couldn’t load models</Trans>}
          detail={error}
          action={
            <Button variant="outline" size="sm" onClick={refresh}>
              <Trans>Retry</Trans>
            </Button>
          }
        />
      )}

      <SetupList
        role="listbox"
        aria-label={t`Models`}
        className={listClassName}
      >
        {visible.map((model) => {
          const selected = config.model?.id === model.id;
          const detail = describe(model, "prices");
          return (
            <button
              key={model.id}
              type="button"
              role="option"
              aria-selected={selected}
              onClick={() => pick(model)}
              className={cn(rowClass, selected && "bg-primary/10")}
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="truncate text-sm font-semibold">
                  {model.name}
                </span>
                {detail && (
                  <span className="truncate text-[0.8rem] text-muted-foreground">
                    {detail}
                  </span>
                )}
              </span>
              {selected && (
                <CheckIcon
                  aria-hidden="true"
                  className="size-4 shrink-0 text-primary"
                />
              )}
            </button>
          );
        })}
        {visible.length === 0 && (
          <PlainRow className="text-sm text-muted-foreground">
            {loading ? (
              <Trans>Loading models…</Trans>
            ) : models.length === 0 ? (
              <Trans>No models available</Trans>
            ) : (
              <Trans>No models match</Trans>
            )}
          </PlainRow>
        )}
      </SetupList>

      {!isChatGpt &&
        (manualId === null ? (
          <p className="px-0.5 text-sm text-muted-foreground">
            <Trans>
              Can’t find it?{" "}
              <button
                type="button"
                className="text-primary underline-offset-4 hover:underline"
                onClick={() => setManualId("")}
              >
                Type a model id
              </button>
            </Trans>
          </p>
        ) : (
          <div className="flex gap-2">
            <Input
              autoFocus
              value={manualId}
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              onChange={(event) => setManualId(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") applyManualId();
              }}
              placeholder={t`Model id`}
              aria-label={t`Model id`}
              className="h-11 min-w-0 flex-1"
            />
            <Button
              className="h-11"
              disabled={!manualId.trim()}
              onClick={applyManualId}
            >
              <Trans>Use</Trans>
            </Button>
          </div>
        ))}
    </div>
  );
}

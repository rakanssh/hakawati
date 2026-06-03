import { useSettingsStore, useTaleStore } from "@/store";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "../ui/drawer";
import { Button } from "../ui/button";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "../ui/command";
import { ChevronsUpDownIcon, RefreshCwIcon, SwordsIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCallback, useMemo, useState } from "react";
import { useLLMProviders } from "@/hooks/useLLMProviders";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../ui/card";
import { Badge } from "../ui/badge";
import { Separator } from "../ui/separator";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { LLMModel } from "@/services/llm/schema";
import { toast } from "sonner";
import { GameMode } from "@/types";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Trans, useLingui } from "@lingui/react/macro";
export function ModelSelect() {
  const { model, setModel } = useSettingsStore();
  const [open, setOpen] = useState(false);
  const { models, loading, refresh } = useLLMProviders();
  const { gameMode } = useTaleStore();
  const { isCompactViewport, isMobilePlatform } = useIsMobile();
  const useDrawer = isCompactViewport || isMobilePlatform;
  const { t } = useLingui();
  const anySupportsToolCalls = models.some((m) => m.supportsToolCalls);

  const handleModelChange = useCallback(
    (model: LLMModel) => {
      if (!model.supportsToolCalls && gameMode === GameMode.GM) {
        toast.warning(
          t`Model cannot be confirmed to support tool calling. GM mode may not work properly.`,
        );
      }
      setModel(model);
      setOpen(false);
    },
    [setModel, gameMode, t],
  );

  function toNumber(value: unknown): number | undefined {
    if (value === null || value === undefined) return undefined;
    const n = typeof value === "string" ? parseFloat(value) : (value as number);
    return Number.isFinite(n) ? (n as number) : undefined;
  }

  function formatUSD(value?: number, opts?: Intl.NumberFormatOptions) {
    if (value === undefined) return "—";
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 6,
      ...opts,
    }).format(value);
  }

  function formatPerMillionUSDFromPerToken(value: unknown) {
    const v = toNumber(value);
    return formatUSD(v !== undefined ? v * 1000000 : undefined, {
      maximumFractionDigits: 3,
    });
  }

  const somethingToDisplay = useMemo(() => {
    return (
      model?.pricing?.prompt !== undefined ||
      model?.pricing?.completion !== undefined ||
      toNumber(model?.pricing?.request) !== undefined ||
      toNumber(model?.pricing?.image) !== undefined ||
      toNumber(model?.pricing?.audio) !== undefined
    );
  }, [
    model?.pricing?.prompt,
    model?.pricing?.completion,
    model?.pricing?.request,
    model?.pricing?.image,
    model?.pricing?.audio,
  ]);

  function PriceRow({ label, perToken }: { label: string; perToken?: number }) {
    const per1k = perToken !== undefined ? perToken * 1000 : undefined;
    const per1m = perToken !== undefined ? perToken * 1000000 : undefined;
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="highlight" className="text-xs">
                {formatUSD(per1k)} / K
              </Badge>
            </TooltipTrigger>
            <TooltipContent>Per 1,000 tokens</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-xs">
                {formatUSD(per1m, { maximumFractionDigits: 2 })} / M
              </Badge>
            </TooltipTrigger>
            <TooltipContent>Per 1,000,000 tokens</TooltipContent>
          </Tooltip>
        </div>
      </div>
    );
  }

  const modelList = (
    <CommandList className={cn(useDrawer && "max-h-[72dvh]")}>
      <CommandEmpty>No model found.</CommandEmpty>
      <CommandGroup>
        {models.map((m) => (
          <CommandItem
            key={m.id}
            value={m.name}
            onSelect={(_) => {
              handleModelChange(m);
              setOpen(false);
            }}
            className={cn(
              "rounded-xs p-1 ml-0",
              useDrawer && "min-h-[44px] p-3",
              model?.name === m.name && "border-l-2 border-foreground",
            )}
          >
            <div className="flex w-full items-center justify-between">
              <div className="flex items-center gap-2">
                {anySupportsToolCalls &&
                  (m.supportsToolCalls ? (
                    <SwordsIcon className="h-4 w-4 text-muted-foreground" />
                  ) : (
                    <div className="w-4 h-4" />
                  ))}
                <span>{m.name}</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                {m.contextLength !== undefined && (
                  <span>tk: {m.contextLength?.toLocaleString() ?? "?"}</span>
                )}
                {m.pricing?.prompt !== undefined && (
                  <span>
                    In: {formatPerMillionUSDFromPerToken(m.pricing?.prompt)}
                    /M
                  </span>
                )}
                {m.pricing?.completion !== undefined && (
                  <span>
                    Out:{" "}
                    {formatPerMillionUSDFromPerToken(m.pricing?.completion)}
                    /M
                  </span>
                )}
              </div>
            </div>
          </CommandItem>
        ))}
      </CommandGroup>
    </CommandList>
  );

  const condensedPricing = model && somethingToDisplay && (
    <div className="flex flex-wrap items-center gap-2 px-1 py-2 text-xs">
      {model.contextLength !== undefined && (
        <Badge variant="outline" className="text-xs">
          {model.contextLength?.toLocaleString()} tk
        </Badge>
      )}
      {model.pricing?.prompt !== undefined && (
        <Badge variant="outline" className="text-xs">
          In: {formatPerMillionUSDFromPerToken(model.pricing?.prompt)}/M
        </Badge>
      )}
      {model.pricing?.completion !== undefined && (
        <Badge variant="outline" className="text-xs">
          Out: {formatPerMillionUSDFromPerToken(model.pricing?.completion)}/M
        </Badge>
      )}
    </div>
  );

  if (useDrawer) {
    return (
      <div className="flex flex-col gap-2">
        <div className="flex gap-2">
          <Drawer open={open} onOpenChange={setOpen}>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="flex-1 justify-between min-h-[44px]"
              onClick={() => setOpen(true)}
            >
              {loading ? t`Loading...` : (model?.name ?? t`Select a model`)}
              <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
            <DrawerContent className="min-h-[68dvh]">
              <DrawerHeader>
                <DrawerTitle>
                  <Trans>Select Model</Trans>
                </DrawerTitle>
              </DrawerHeader>
              <Command className="border-none">
                <CommandInput
                  placeholder={t`Search model...`}
                  className="rounded-xs"
                />
                {modelList}
              </Command>
            </DrawerContent>
          </Drawer>
          <Button
            variant="outline"
            size="icon"
            onClick={refresh}
            disabled={loading}
            className="min-h-[44px] min-w-[44px]"
          >
            <RefreshCwIcon
              className={cn("h-4 w-4", loading && "animate-spin")}
            />
          </Button>
        </div>
        {condensedPricing}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="flex-1 justify-between"
            >
              {loading ? t`Loading...` : (model?.name ?? t`Select a model`)}
              <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full p-0 rounded-xs">
            <Command>
              <CommandInput
                placeholder={t`Search model...`}
                className="rounded-xs"
              />
              {modelList}
            </Command>
          </PopoverContent>
        </Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="outline"
              size="icon"
              onClick={refresh}
              disabled={loading}
            >
              <RefreshCwIcon
                className={cn("h-4 w-4", loading && "animate-spin")}
              />
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            <Trans>Refresh models</Trans>
          </TooltipContent>
        </Tooltip>
      </div>
      {model && somethingToDisplay && (
        <Card className="mt-2">
          <CardHeader>
            <CardTitle className="text-base">{model.name}</CardTitle>
            {model.contextLength !== undefined && (
              <CardDescription>
                <Trans>Context window:</Trans>{" "}
                {model.contextLength?.toLocaleString()} tokens
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {model.pricing?.prompt !== undefined && (
              <PriceRow
                label={t`Input (prompt)`}
                perToken={toNumber(model.pricing?.prompt)}
              />
            )}
            {model.pricing?.completion !== undefined && (
              <>
                <Separator />

                <PriceRow
                  label={t`Output (completion)`}
                  perToken={toNumber(model.pricing?.completion)}
                />
              </>
            )}
            {!!(
              toNumber(model.pricing?.request) ||
              toNumber(model.pricing?.image) ||
              toNumber(model.pricing?.audio)
            ) && (
              <>
                <Separator />
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {toNumber(model.pricing?.request) !== undefined && (
                    <Badge variant="outline">
                      {t`Request:`}{" "}
                      {formatUSD(toNumber(model.pricing?.request))}
                    </Badge>
                  )}
                  {toNumber(model.pricing?.image) !== undefined && (
                    <Badge variant="outline">
                      {t`Image:`} {formatUSD(toNumber(model.pricing?.image))}
                    </Badge>
                  )}
                  {toNumber(model.pricing?.audio) !== undefined && (
                    <Badge variant="outline">
                      {t`Audio:`} {formatUSD(toNumber(model.pricing?.audio))}
                    </Badge>
                  )}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

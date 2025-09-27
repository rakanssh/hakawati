import { useSettingsStore, useTaleStore } from "@/store";
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover";
import { Button } from "../ui/button";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "../ui/command";
import {
  CheckIcon,
  ChevronsUpDownIcon,
  RefreshCwIcon,
  SwordsIcon,
} from "lucide-react";
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
import { ResponseMode } from "@/types/api.type";
import { toast } from "sonner";
import { GameMode } from "@/types";

export function ModelSelect() {
  const { model, setModel, setResponseMode, responseMode } = useSettingsStore();
  const [open, setOpen] = useState(false);
  const { models, loading, refresh } = useLLMProviders();
  const { gameMode } = useTaleStore();

  const anySupportsResponseFormat = models.some(
    (m) => m.supportsResponseFormat,
  );

  const handleModelChange = useCallback(
    (model: LLMModel) => {
      if (
        !model.supportsResponseFormat &&
        responseMode === ResponseMode.RESPONSE_FORMAT &&
        gameMode === GameMode.GM
      ) {
        setResponseMode(ResponseMode.FREE_FORM);
        toast.warning(
          "Model appears to not support response format. Setting response mode to free form.",
        );
      }
      setModel(model);
      setOpen(false);
    },
    [setModel, setResponseMode, responseMode, gameMode],
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
              {loading ? "Loading..." : (model?.name ?? "Select a model")}
              <ChevronsUpDownIcon className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-full p-0 rounded-xs">
            <Command>
              <CommandInput
                placeholder="Search model..."
                className="rounded-xs"
              />
              <CommandList>
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
                      className="rounded-xs p-1 ml-0"
                    >
                      <CheckIcon
                        className={cn(
                          "mr-0 h-4 w-4",
                          model?.name === m.name ? "opacity-100" : "opacity-0",
                        )}
                      />
                      <div className="flex w-full items-center justify-between">
                        <div className="flex items-center gap-2">
                          {anySupportsResponseFormat &&
                            (m.supportsResponseFormat ? (
                              <SwordsIcon className="h-4 w-4 text-muted-foreground" />
                            ) : (
                              <div className="w-4 h-4" />
                            ))}
                          <span>{m.name}</span>
                        </div>
                        <div className="flex items-center gap-2 text-xs text-muted-foreground">
                          {m.contextLength !== undefined && (
                            <span>
                              tk: {m.contextLength?.toLocaleString() ?? "?"}
                            </span>
                          )}
                          {m.pricing?.prompt !== undefined && (
                            <span>
                              In:{" "}
                              {formatPerMillionUSDFromPerToken(
                                m.pricing?.prompt,
                              )}
                              /M
                            </span>
                          )}
                          {m.pricing?.completion !== undefined && (
                            <span>
                              Out:{" "}
                              {formatPerMillionUSDFromPerToken(
                                m.pricing?.completion,
                              )}
                              /M
                            </span>
                          )}
                        </div>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
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
          <TooltipContent>Refresh models</TooltipContent>
        </Tooltip>
      </div>
      {model && somethingToDisplay && (
        <Card className="mt-2">
          <CardHeader>
            <CardTitle className="text-base">{model.name}</CardTitle>
            {model.contextLength !== undefined && (
              <CardDescription>
                Context window: {model.contextLength?.toLocaleString()} tokens
              </CardDescription>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {model.pricing?.prompt !== undefined && (
              <PriceRow
                label="Input (prompt)"
                perToken={toNumber(model.pricing?.prompt)}
              />
            )}
            {model.pricing?.completion !== undefined && (
              <>
                <Separator />

                <PriceRow
                  label="Output (completion)"
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
                      Request: {formatUSD(toNumber(model.pricing?.request))}
                    </Badge>
                  )}
                  {toNumber(model.pricing?.image) !== undefined && (
                    <Badge variant="outline">
                      Image: {formatUSD(toNumber(model.pricing?.image))}
                    </Badge>
                  )}
                  {toNumber(model.pricing?.audio) !== undefined && (
                    <Badge variant="outline">
                      Audio: {formatUSD(toNumber(model.pricing?.audio))}
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

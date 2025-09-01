import { useSettingsStore } from "@/store";
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
import { CheckIcon, ChevronsUpDownIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
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

export function ModelSelect() {
  const { model, setModel } = useSettingsStore();
  const [open, setOpen] = useState(false);
  const { models, loading } = useLLMProviders();

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

  function PriceRow({ label, perToken }: { label: string; perToken?: number }) {
    const per1k = perToken !== undefined ? perToken * 1000 : undefined;
    const per1m = perToken !== undefined ? perToken * 1000000 : undefined;
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-muted-foreground">{label}</div>
        <div className="flex items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="highlight" className="text-xs rounded-xs">
                {formatUSD(per1k)} / K
              </Badge>
            </TooltipTrigger>
            <TooltipContent>Per 1,000 tokens</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Badge variant="outline" className="text-xs rounded-xs">
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
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between rounded-xs  "
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
                      setModel(m);
                      setOpen(false);
                    }}
                    className="rounded-xs"
                  >
                    <CheckIcon
                      className={cn(
                        "mr-2 h-4 w-4",
                        model?.name === m.name ? "opacity-100" : "opacity-0",
                      )}
                    />
                    <div className="flex w-full items-center justify-between">
                      <span>{m.name}</span>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>tk: {m.contextLength.toLocaleString()}</span>
                        {m.pricing?.prompt !== undefined && (
                          <span>
                            In:{" "}
                            {formatPerMillionUSDFromPerToken(m.pricing?.prompt)}
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
      {model && (
        <Card className="mt-2 rounded-xs">
          <CardHeader>
            <CardTitle className="text-base">{model.name}</CardTitle>
            <CardDescription>
              Context window: {model.contextLength.toLocaleString()} tokens
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <PriceRow
              label="Input (prompt)"
              perToken={toNumber(model.pricing?.prompt)}
            />
            <Separator />
            <PriceRow
              label="Output (completion)"
              perToken={toNumber(model.pricing?.completion)}
            />
            {!!(
              toNumber(model.pricing?.request) ||
              toNumber(model.pricing?.image) ||
              toNumber(model.pricing?.audio)
            ) && (
              <>
                <Separator />
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  {toNumber(model.pricing?.request) !== undefined && (
                    <Badge variant="outline" className="rounded-xs">
                      Request: {formatUSD(toNumber(model.pricing?.request))}
                    </Badge>
                  )}
                  {toNumber(model.pricing?.image) !== undefined && (
                    <Badge variant="outline" className="rounded-xs">
                      Image: {formatUSD(toNumber(model.pricing?.image))}
                    </Badge>
                  )}
                  {toNumber(model.pricing?.audio) !== undefined && (
                    <Badge variant="outline" className="rounded-xs">
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

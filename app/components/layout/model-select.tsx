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
import { useCallback, useState } from "react";
import { useLLMProviders } from "@/hooks/useLLMProviders";
import { Tooltip, TooltipContent, TooltipTrigger } from "../ui/tooltip";
import { LLMModel } from "@/services/llm/schema";
import { toast } from "sonner";
import { GameMode, ModelRole } from "@/types";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Trans, useLingui } from "@lingui/react/macro";

interface ModelSelectProps {
  role?: ModelRole;
}

export function ModelSelect({ role = "narrator" }: ModelSelectProps) {
  const model = useSettingsStore((state) => state.modelRoles[role].model);
  const setRoleModel = useSettingsStore((state) => state.setRoleModel);
  const [open, setOpen] = useState(false);
  const { models, loading, refresh } = useLLMProviders(role);
  const { gameMode } = useTaleStore();
  const { isCompactViewport, isMobilePlatform } = useIsMobile();
  const useDrawer = isCompactViewport || isMobilePlatform;
  const { t } = useLingui();
  const anySupportsToolCalls = models.some((m) => m.supportsToolCalls);

  const handleModelChange = useCallback(
    (model: LLMModel) => {
      if (
        role === "narrator" &&
        !model.supportsToolCalls &&
        gameMode === GameMode.GM
      ) {
        toast.warning(
          t`Model cannot be confirmed to support tool calling. GM mode may not work properly.`,
        );
      }
      setRoleModel(role, model);
      setOpen(false);
    },
    [setRoleModel, role, gameMode, t],
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

  function modelMeta(m: LLMModel): string[] {
    const meta: string[] = [];
    if (m.contextLength !== undefined) {
      meta.push(`${m.contextLength.toLocaleString()} tk`);
    }
    if (m.pricing?.prompt !== undefined) {
      meta.push(`In ${formatPerMillionUSDFromPerToken(m.pricing.prompt)}/M`);
    }
    if (m.pricing?.completion !== undefined) {
      meta.push(
        `Out ${formatPerMillionUSDFromPerToken(m.pricing.completion)}/M`,
      );
    }
    return meta;
  }

  function SelectedModelLabel() {
    if (loading) {
      return <span className="truncate">{t`Loading...`}</span>;
    }
    if (!model) {
      return <span className="truncate">{t`Select a model`}</span>;
    }

    const meta = modelMeta(model);
    return (
      <div className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-start">
        <span className="max-w-full truncate">{model.name}</span>
        {meta.length > 0 && (
          <span className="max-w-full truncate text-xs font-normal text-muted-foreground">
            {meta.join(" · ")}
          </span>
        )}
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
              <div className="flex shrink-0 items-center gap-2 text-xs text-muted-foreground">
                {modelMeta(m).map((item) => (
                  <span key={item}>{item}</span>
                ))}
              </div>
            </div>
          </CommandItem>
        ))}
      </CommandGroup>
    </CommandList>
  );

  if (useDrawer) {
    return (
      <div className="flex items-stretch gap-2">
        <Drawer open={open} onOpenChange={setOpen}>
          <Button
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="min-h-[44px] flex-1 justify-between gap-2"
            onClick={() => setOpen(true)}
          >
            <SelectedModelLabel />
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
          className="h-auto min-h-[44px] min-w-[44px] self-stretch"
        >
          <RefreshCwIcon className={cn("h-4 w-4", loading && "animate-spin")} />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-stretch gap-2">
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className="min-h-11 flex-1 justify-between gap-2"
            >
              <SelectedModelLabel />
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
              className="h-auto self-stretch"
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
    </div>
  );
}

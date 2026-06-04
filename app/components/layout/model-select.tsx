import { useSettingsStore, useTaleStore } from "@/store";
import { Input } from "../ui/input";
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
import { ApiPreset, GameMode, ModelRole } from "@/types";
import { useIsMobile } from "@/hooks/useIsMobile";
import { Trans, useLingui } from "@lingui/react/macro";
import { getModelMetaLabels } from "./model-select-meta";
import { DEFAULT_TTS_VOICE } from "@/store/useSettingsStore";

interface ModelSelectProps {
  role?: ModelRole;
}

export function ModelSelect({ role = "narrator" }: ModelSelectProps) {
  const model = useSettingsStore((state) => state.modelRoles[role].model);
  const activePreset = useSettingsStore(
    (state) => state.modelRoles[role].activePreset,
  );
  const roleVoice = useSettingsStore((state) => state.modelRoles[role].voice);
  const setRoleModel = useSettingsStore((state) => state.setRoleModel);
  const setRoleVoice = useSettingsStore((state) => state.setRoleVoice);
  const [open, setOpen] = useState(false);
  const [manualModelId, setManualModelId] = useState("");
  const { models, loading, refresh } = useLLMProviders(role);
  const { gameMode } = useTaleStore();
  const { isCompactViewport, isMobilePlatform } = useIsMobile();
  const useDrawer = isCompactViewport || isMobilePlatform;
  const { t } = useLingui();
  const anySupportsToolCalls = models.some((m) => m.supportsToolCalls);
  const canSetManualTtsModel =
    role === "textToSpeech" &&
    (activePreset === ApiPreset.GENERIC || activePreset === ApiPreset.LOCAL);

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
      if (role === "textToSpeech" && model.supportedVoices?.length) {
        const currentVoice = roleVoice?.trim();
        if (
          !currentVoice ||
          currentVoice === DEFAULT_TTS_VOICE ||
          !model.supportedVoices.includes(currentVoice)
        ) {
          setRoleVoice(role, model.supportedVoices[0]);
        }
      }
      setOpen(false);
    },
    [gameMode, role, roleVoice, setRoleModel, setRoleVoice, t],
  );

  const handleManualModelSet = useCallback(() => {
    const id = manualModelId.trim();
    if (!id) return;
    setRoleModel(role, { id, name: id });
    setManualModelId("");
  }, [manualModelId, role, setRoleModel]);

  function modelMeta(m: LLMModel): string[] {
    return getModelMetaLabels(m, role);
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
      <div className="flex flex-col gap-2">
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
            <RefreshCwIcon
              className={cn("h-4 w-4", loading && "animate-spin")}
            />
          </Button>
        </div>
        {canSetManualTtsModel && (
          <div className="flex gap-2">
            <Input
              value={manualModelId}
              onChange={(e) => setManualModelId(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleManualModelSet();
              }}
              placeholder={t`Enter model id manually`}
            />
            <Button
              type="button"
              variant="outline"
              onClick={handleManualModelSet}
              disabled={!manualModelId.trim()}
              className="shrink-0"
            >
              <Trans>Set</Trans>
            </Button>
          </div>
        )}
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
      {canSetManualTtsModel && (
        <div className="flex gap-2">
          <Input
            value={manualModelId}
            onChange={(e) => setManualModelId(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") handleManualModelSet();
            }}
            placeholder={t`Enter model id manually`}
          />
          <Button
            type="button"
            variant="outline"
            onClick={handleManualModelSet}
            disabled={!manualModelId.trim()}
            className="shrink-0"
          >
            <Trans>Set</Trans>
          </Button>
        </div>
      )}
    </div>
  );
}

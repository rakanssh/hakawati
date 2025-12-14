import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ModelSelect } from "@/components/layout";
import { useSettingsStore } from "@/store";
import { ApiPreset, ApiType } from "@/types/api.type";
import { apiPresets, apiPresetMap } from "@/data/api-presets";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { useLocalServerDiscovery } from "@/hooks/useLocalServerDiscovery";
import { ProviderHelpModal } from "./provider-help-modal";
import { Eye, EyeOff } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useLingui as useLinguiCore } from "@lingui/react";

export default function SettingsApi() {
  const { t } = useLingui();
  const { _ } = useLinguiCore();
  const {
    apiKey,
    setApiKey,
    apiType,
    activePreset,
    setActivePreset,
    openAiBaseUrl,
    setOpenAiBaseUrl,
    setModel,
  } = useSettingsStore();
  const [baseUrl, setBaseUrl] = useState(openAiBaseUrl);
  const [showApiKey, setShowApiKey] = useState(false);
  const { servers, scanning, error, scan } = useLocalServerDiscovery(apiType);

  const isLocalPreset = activePreset === ApiPreset.LOCAL;
  const isEditableUrl = apiPresetMap[activePreset]?.editableUrl ?? false;

  useEffect(() => {
    setBaseUrl(openAiBaseUrl);
  }, [openAiBaseUrl]);

  useEffect(() => {
    if (isLocalPreset && apiType === ApiType.OPENAI && servers.length === 0) {
      scan();
    }
  }, [isLocalPreset, apiType, scan, servers.length]);

  function handleUrlChange(newUrl: string) {
    setOpenAiBaseUrl(newUrl);
    setModel(undefined);
  }

  return (
    <div className="flex flex-col gap-4 max-w-full">
      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="flex flex-col gap-2 sm:col-span-1">
          <Label>
            <Trans>Provider</Trans>
          </Label>
          <Select
            value={activePreset}
            onValueChange={(value) => setActivePreset(value as ApiPreset)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t`Select a provider`} />
            </SelectTrigger>
            <SelectContent>
              {apiPresets.map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>
                  {_(preset.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2 sm:col-span-3">
          <Label>
            <Trans>Base URL</Trans>
          </Label>
          <div className="flex gap-2">
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              onBlur={() => {
                if (isEditableUrl && baseUrl.trim() !== openAiBaseUrl.trim()) {
                  handleUrlChange(baseUrl);
                }
              }}
              onKeyDown={(e) => {
                if (isEditableUrl && e.key === "Enter") {
                  handleUrlChange(baseUrl);
                }
              }}
              placeholder={isLocalPreset ? t`http://localhost:11434/v1` : ""}
              disabled={!isEditableUrl}
            />
            {isEditableUrl && (
              <Button
                variant="outline"
                onClick={() => handleUrlChange(baseUrl)}
                disabled={
                  !baseUrl?.trim() || baseUrl.trim() === openAiBaseUrl.trim()
                }
                className="shrink-0"
              >
                <Trans>Set</Trans>
              </Button>
            )}
          </div>
        </div>
      </div>

      {isLocalPreset && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label>
              <Trans>Local API Servers</Trans>
            </Label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => scan()}
                disabled={scanning}
              >
                {scanning ? <Trans>Scanning...</Trans> : <Trans>Rescan</Trans>}
              </Button>
            </div>
          </div>
          {!!error && <span className="text-xs text-destructive">{error}</span>}
          {scanning && servers.length === 0 && (
            <span className="text-sm text-muted-foreground">
              <Trans>Scanning for local servers...</Trans>
            </span>
          )}
          {!scanning && servers.length === 0 && (
            <span className="text-sm text-muted-foreground">
              <Trans>No local servers found.</Trans>
            </span>
          )}
          {servers.length > 0 && (
            <div className="flex flex-col gap-2">
              {servers.map((s) => (
                <div
                  key={s.baseUrl}
                  className="flex items-center justify-between rounded-xs border p-2"
                >
                  <div className="flex flex-col">
                    <span className="text-sm">{s.label}</span>
                    <span className="text-xs text-muted-foreground">
                      {s.baseUrl} {s.requiresAuth ? t`(auth required)` : ""}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => handleUrlChange(s.baseUrl)}
                    disabled={openAiBaseUrl.trim() === s.baseUrl.trim()}
                  >
                    <Trans>Use</Trans>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label>
          <Trans>API Key</Trans>
        </Label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Input
              type={showApiKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder={
                isLocalPreset ? t`Optional for most local servers` : ""
              }
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              aria-label={showApiKey ? t`Hide API key` : t`Show API key`}
            >
              {showApiKey ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
          {apiPresetMap[activePreset]?.help && (
            <ProviderHelpModal preset={apiPresetMap[activePreset]} />
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label>
          <Trans>Model</Trans>
        </Label>
        <ModelSelect />
      </div>
    </div>
  );
}

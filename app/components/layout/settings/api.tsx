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

export default function SettingsApi() {
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
          <Label>Provider</Label>
          <Select
            value={activePreset}
            onValueChange={(value) => setActivePreset(value as ApiPreset)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a provider" />
            </SelectTrigger>
            <SelectContent>
              {apiPresets.map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>
                  {preset.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2 sm:col-span-3">
          <Label>Base URL</Label>
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
              placeholder={isLocalPreset ? "http://localhost:11434/v1" : ""}
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
                Set
              </Button>
            )}
          </div>
        </div>
      </div>

      {isLocalPreset && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label>Local API Servers</Label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                onClick={() => scan()}
                disabled={scanning}
              >
                {scanning ? "Scanning..." : "Rescan"}
              </Button>
            </div>
          </div>
          {!!error && <span className="text-xs text-destructive">{error}</span>}
          {scanning && servers.length === 0 && (
            <span className="text-sm text-muted-foreground">
              Scanning for local servers...
            </span>
          )}
          {!scanning && servers.length === 0 && (
            <span className="text-sm text-muted-foreground">
              No local servers found.
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
                      {s.baseUrl} {s.requiresAuth ? "(auth required)" : ""}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => handleUrlChange(s.baseUrl)}
                    disabled={openAiBaseUrl.trim() === s.baseUrl.trim()}
                  >
                    Use
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2">
        <Label>API Key</Label>
        <div className="flex gap-2">
          <Input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder={isLocalPreset ? "Optional for most local servers" : ""}
          />
          {apiPresetMap[activePreset]?.help && (
            <ProviderHelpModal preset={apiPresetMap[activePreset]} />
          )}
        </div>
      </div>
      <div className="flex flex-col gap-2">
        <Label>Model</Label>
        <ModelSelect />
      </div>
    </div>
  );
}

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ModelSelect } from "@/components/layout";
import { useSettingsStore, useTaleStore } from "@/store";
// No navigation side-effects from here
import { Separator } from "@/components/ui/separator";
import { ApiType, ResponseMode } from "@/types/api.type";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { GameMode } from "@/types";
import { SwordsIcon, InfoIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { useLocalServerDiscovery } from "@/hooks/useLocalServerDiscovery";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export default function SettingsApi() {
  const {
    apiKey,
    setApiKey,
    apiType,
    openAiBaseUrl,
    setApiType,
    setOpenAiBaseUrl,
    responseMode,
    setResponseMode,
    setModel,
  } = useSettingsStore();
  const { gameMode } = useTaleStore();
  const [baseUrl, setBaseUrl] = useState(openAiBaseUrl);
  const { servers, scanning, error, scan } = useLocalServerDiscovery(apiType);

  useEffect(() => {
    setBaseUrl(openAiBaseUrl);
  }, [openAiBaseUrl]);

  useEffect(() => {
    if (apiType === ApiType.OPENAI && servers.length === 0) {
      scan();
    }
  }, [apiType, scan, servers.length]);

  function resolveApiTypeLabel(apiType: ApiType) {
    if (apiType === ApiType.OPENAI) return "OpenAI";
    return "Borked";
  }

  function getApiTypeOptions() {
    return Object.values(ApiType).map((type) => ({
      label: resolveApiTypeLabel(type),
      value: type,
    }));
  }

  function resolveResponseModeLabel(responseMode: ResponseMode) {
    if (responseMode === ResponseMode.FREE_FORM) return "Free Form";
    return "Response Format";
  }

  function handleUrlChange(newUrl: string) {
    setOpenAiBaseUrl(newUrl);
    setModel(undefined);
  }

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <Label>API Settings</Label>
      <Separator />

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="flex flex-col gap-2 sm:col-span-1">
          <Label>
            API Type
            <Tooltip>
              <TooltipTrigger>
                <InfoIcon className="w-4 h-4" />
              </TooltipTrigger>
              <TooltipContent>
                This refers to compatible URLs, not exclusively this provider.
              </TooltipContent>
            </Tooltip>
          </Label>
          <Select
            value={apiType}
            onValueChange={(value) => setApiType(value as ApiType)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select an API type" />
              <SelectContent>
                {getApiTypeOptions().map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </SelectTrigger>
          </Select>
        </div>
        <div className="flex flex-col gap-2 sm:col-span-3">
          <Label>{resolveApiTypeLabel(apiType)}-Compatible base URL</Label>
          <div className="flex gap-2">
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              onBlur={() => {
                if (baseUrl.trim() !== openAiBaseUrl.trim()) {
                  handleUrlChange(baseUrl);
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  handleUrlChange(baseUrl);
                }
              }}
            />
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
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Label>Local servers</Label>
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
      <div className="flex flex-col gap-2">
        <Label>API Key</Label>
        <Input
          type="password"
          value={apiKey}
          onChange={(e) => setApiKey(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Model</Label>
        <ModelSelect />
      </div>
      {gameMode === GameMode.GM && (
        <div className="flex flex-col gap-2">
          <Label>Response Mode</Label>
          <span className="text-sm text-muted-foreground">
            This is the response mode for the API.
            <br />
            <ul className="list-disc pl-4 space-y-1 text-sm">
              <li>
                Response Format: Predefined schema.{" "}
                {<SwordsIcon className="w-4 h-4 inline-block" />} icon support
                this.
              </li>
              <li>Free Form: Works with any model. Not Recommended.</li>
            </ul>
          </span>

          <Select
            value={responseMode}
            onValueChange={(value) => setResponseMode(value as ResponseMode)}
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select a response mode" />
            </SelectTrigger>
            <SelectContent>
              {Object.values(ResponseMode).map((option: ResponseMode) => (
                <SelectItem key={option} value={option}>
                  {resolveResponseModeLabel(option)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

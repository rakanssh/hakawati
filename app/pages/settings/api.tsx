import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ModelSelect } from "@/components/layout";
import { useSettingsStore, useTaleStore } from "@/store";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
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
import { SwordsIcon } from "lucide-react";

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
  } = useSettingsStore();
  const { gameMode } = useTaleStore();
  const navigate = useNavigate();
  useEffect(() => {
    navigate({ to: "." });
  }, [navigate]);

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

  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <Label>API Settings</Label>
      <Separator />

      <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
        <div className="flex flex-col gap-2 sm:col-span-1">
          <Label>API Type</Label>
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
          <Label>{resolveApiTypeLabel(apiType)} base URL</Label>
          <Input
            value={openAiBaseUrl}
            onChange={(e) => setOpenAiBaseUrl(e.target.value)}
          />
        </div>
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

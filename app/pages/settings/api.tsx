import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ModelSelect } from "@/components/layout";
import { useSettingsStore } from "@/store";
import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Separator } from "@/components/ui/separator";
import { ApiType } from "@/types";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function SettingsApi() {
  const {
    apiKey,
    setApiKey,
    apiType,
    openAiBaseUrl,
    setApiType,
    setOpenAiBaseUrl,
  } = useSettingsStore();
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
    </div>
  );
}

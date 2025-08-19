import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ModelSelect } from "@/components/layout";
import { useSettingsStore } from "@/store";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { Separator } from "@/components/ui/separator";
import { ApiType } from "@/types";

export default function SettingsApi() {
  const { apiKey, setApiKey, apiType, openAiBaseUrl, setOpenAiBaseUrl } =
    useSettingsStore();
  const navigate = useNavigate();
  useEffect(() => {
    // Replace the history entry so switching tabs doesn't build up history
    navigate(".", { replace: true });
  }, [navigate]);

  function resolveApiTypeLabel(apiType: ApiType) {
    if (apiType === ApiType.OPENAI) return "OpenAI";
    return "Borked";
  }
  return (
    <div className="flex flex-col gap-4 max-w-2xl">
      <Label>API Settings</Label>
      <Separator />
      <div className="flex flex-col gap-2">
        <Label>{resolveApiTypeLabel(apiType)} base URL</Label>
        <Input
          value={openAiBaseUrl}
          onChange={(e) => setOpenAiBaseUrl(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-2">
        <Label>API Key</Label>
        <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
      </div>
      <div className="flex flex-col gap-2">
        <Label>Model</Label>
        <ModelSelect />
      </div>
    </div>
  );
}

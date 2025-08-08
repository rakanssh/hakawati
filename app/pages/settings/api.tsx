import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ModelSelect } from "@/components/layout";
import { useSettingsStore } from "@/store";
import { useEffect } from "react";
import { useNavigate } from "react-router";

export default function SettingsApi() {
  const { apiKey, setApiKey } = useSettingsStore();
  const navigate = useNavigate();
  useEffect(() => {
    // Replace the history entry so switching tabs doesn't build up history
    navigate(".", { replace: true });
  }, [navigate]);
  return (
    <div className="flex flex-col gap-3 max-w-xl">
      <div>
        <Label>API Key</Label>
        <Input value={apiKey} onChange={(e) => setApiKey(e.target.value)} />
      </div>
      <div>
        <Label>Model</Label>
        <ModelSelect />
      </div>
    </div>
  );
}

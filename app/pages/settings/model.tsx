import { Label } from "@/components/ui/label";
import { useEffect } from "react";
import { useNavigate } from "react-router";

export default function SettingsModel() {
  const navigate = useNavigate();
  useEffect(() => {
    navigate(".", { replace: true });
  }, [navigate]);
  return (
    <div className="flex flex-col gap-2">
      <Label>Model settings</Label>
      <p className="text-sm text-muted-foreground">Coming soon.</p>
    </div>
  );
}

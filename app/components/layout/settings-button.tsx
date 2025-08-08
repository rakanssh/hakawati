import { Button } from "../ui/button";
import { SettingsIcon } from "lucide-react";
import { useNavigate } from "react-router";

export function SettingsButton() {
  const navigate = useNavigate();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => navigate("/demo/settings/api", { replace: false })}
    >
      <SettingsIcon className="w-4 h-4" />
    </Button>
  );
}

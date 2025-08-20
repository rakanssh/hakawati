import { Button } from "../ui/button";
import { SettingsIcon } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";

export function SettingsButton({
  ...props
}: React.ComponentProps<typeof Button>) {
  const navigate = useNavigate();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => navigate({ to: "/demo/settings/api" })}
      {...props}
    >
      <SettingsIcon className="w-4 h-4" />
    </Button>
  );
}

import { Button } from "../ui/button";
import { SettingsIcon } from "lucide-react";
import { useLocation, useNavigate } from "@tanstack/react-router";

export function SettingsButton({
  ...props
}: React.ComponentProps<typeof Button>) {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() =>
        navigate({
          to: "/settings/game",
          // Preserve existing search and carry a redirect back target (path only)
          search: (old: unknown) => ({
            ...(old as Record<string, unknown>),
            redirectPath: location.pathname,
          }),
          // Render settings over the current page
          mask: { to: location.pathname },
        })
      }
      {...props}
    >
      <SettingsIcon className="w-4 h-4" />
    </Button>
  );
}

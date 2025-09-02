import { Button } from "../../ui/button";
import { SettingsIcon } from "lucide-react";
import { useState } from "react";
import { SettingsModal } from "@/components/layout/settings";

export function SettingsButton({
  ...props
}: React.ComponentProps<typeof Button>) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setIsOpen(true)}
        {...props}
      >
        <SettingsIcon className="w-4 h-4" />
      </Button>

      <SettingsModal open={isOpen} onOpenChange={setIsOpen} />
    </>
  );
}

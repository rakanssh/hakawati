import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/useIsMobile";
import { ApiPresetConfig } from "@/data/api-presets";
import { ExternalLinkIcon } from "lucide-react";

interface ProviderHelpModalProps {
  preset: ApiPresetConfig;
}

export function ProviderHelpModal({ preset }: ProviderHelpModalProps) {
  const [open, setOpen] = useState(false);
  const { isMobileViewport } = useIsMobile();

  if (!preset.help) return null;

  const { help } = preset;

  const content = (
    <div className="flex flex-col gap-4">
      <ol className="list-decimal list-inside space-y-2 text-sm">
        {help.steps.map((step, i) => (
          <li key={i} className="text-muted-foreground">
            <span className="text-foreground">{step}</span>
          </li>
        ))}
      </ol>

      {(help.signupUrl || help.apiKeyUrl) && (
        <div className="flex flex-wrap gap-2 pt-2">
          {help.signupUrl && (
            <Button variant="outline" size="sm" asChild>
              <a
                href={help.signupUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Sign Up
                <ExternalLinkIcon className="ml-1.5 h-3.5 w-3.5" />
              </a>
            </Button>
          )}
          {help.apiKeyUrl && (
            <Button variant="outline" size="sm" asChild>
              <a
                href={help.apiKeyUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Get API Key
                <ExternalLinkIcon className="ml-1.5 h-3.5 w-3.5" />
              </a>
            </Button>
          )}
        </div>
      )}
    </div>
  );

  if (isMobileViewport) {
    return (
      <>
        <Button
          variant="outline"
          size="default"
          onClick={() => setOpen(true)}
          className="shrink-0"
          aria-label={`Help for ${preset.label}`}
        >
          Instructions
        </Button>
        <Drawer open={open} onOpenChange={setOpen}>
          <DrawerContent>
            <DrawerHeader>
              <DrawerTitle>{preset.label}</DrawerTitle>
              <DrawerDescription>{help.description}</DrawerDescription>
            </DrawerHeader>
            <div className="px-4 pb-6">{content}</div>
          </DrawerContent>
        </Drawer>
      </>
    );
  }

  return (
    <>
      <Button
        variant="outline"
        size="default"
        onClick={() => setOpen(true)}
        className="shrink-0"
        aria-label={`Help for ${preset.label}`}
      >
        Instructions
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{preset.label}</DialogTitle>
            <DialogDescription>{help.description}</DialogDescription>
          </DialogHeader>
          {content}
        </DialogContent>
      </Dialog>
    </>
  );
}

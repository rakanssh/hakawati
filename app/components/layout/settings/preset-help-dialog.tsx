import { ApiPresetConfig } from "@/data/api-presets";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ExternalLinkIcon } from "lucide-react";

interface PresetHelpDialogProps {
  preset: ApiPresetConfig | undefined;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PresetHelpDialog({
  preset,
  open,
  onOpenChange,
}: PresetHelpDialogProps) {
  const { help } = preset ?? {};
  if (!preset || !help) return null;

  const hasLinks = help.signupUrl || help.apiKeyUrl;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{preset.label}</DialogTitle>
          {help.description && (
            <DialogDescription>{help.description}</DialogDescription>
          )}
        </DialogHeader>

        {help.steps && help.steps.length > 0 && (
          <div className="flex flex-col gap-2">
            <h4 className="text-sm font-medium">Getting Started</h4>
            <ol className="list-decimal list-inside space-y-1.5 text-sm text-muted-foreground">
              {help.steps.map((step, index) => (
                <li key={index}>{step}</li>
              ))}
            </ol>
          </div>
        )}

        {hasLinks && (
          <div className="flex flex-wrap gap-2 pt-2">
            {help.signupUrl && (
              <Button variant="outline" size="sm" asChild>
                <a
                  href={help.signupUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Sign Up
                  <ExternalLinkIcon className="ml-1.5 size-3.5" />
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
                  <ExternalLinkIcon className="ml-1.5 size-3.5" />
                </a>
              </Button>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

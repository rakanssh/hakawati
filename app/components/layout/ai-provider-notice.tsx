import { Trans } from "@lingui/react/macro";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { detectPlatform, Platform } from "@/lib/platform";
import { useSettingsStore } from "@/store/useSettingsStore";

// App Review asks for this before anything is sent to a third-party AI.
export function useAiProviderNoticeOpen(): boolean {
  const acknowledged = useSettingsStore(
    (state) => state.aiProviderNoticeAcknowledged,
  );
  return !acknowledged && detectPlatform() === Platform.IOS;
}

export function AiProviderNotice() {
  const open = useAiProviderNoticeOpen();
  const acknowledge = useSettingsStore(
    (state) => state.acknowledgeAiProviderNotice,
  );
  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>
            <Trans>Hakawati needs an AI provider</Trans>
          </DialogTitle>
          <DialogDescription asChild>
            <div className="grid gap-3">
              <p>
                <Trans>
                  Hakawati is a client for AI models and doesn’t come with one.
                  To play, set up a provider such as OpenRouter, OpenAI or
                  ChatGPT in AI Setup.
                </Trans>
              </p>
              <p>
                <Trans>
                  Your stories, and any photos or recordings you send, go to the
                  provider you choose.
                </Trans>
              </p>
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={acknowledge}>
            <Trans>Continue</Trans>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

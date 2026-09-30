import { useState } from "react";
import { Trans } from "@lingui/react/macro";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLinkIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useChatGpt } from "@/hooks/useChatGpt";
import { useChatGptStore } from "@/store/useChatGptStore";
import chatGptLogo from "@/assets/chatgpt-logo-white.svg";

export function ChatGptUsageLink() {
  const [error, setError] = useState(false);
  return (
    <>
      <button
        type="button"
        className="inline-flex items-center gap-1 text-xs underline underline-offset-4 hover:text-foreground"
        onClick={() => {
          setError(false);
          void openUrl("https://chatgpt.com/settings/usage").catch(() =>
            setError(true),
          );
        }}
      >
        <Trans>Manage usage</Trans>
        <ExternalLinkIcon aria-hidden="true" className="size-3" />
      </button>
      {error && (
        <span role="alert" className="block text-xs text-destructive">
          <Trans>
            Could not open your browser. Visit ChatGPT Settings → Usage.
          </Trans>
        </span>
      )}
    </>
  );
}

export function ChatGptConnection() {
  const {
    session,
    loading,
    busy,
    error,
    revocationUnconfirmed,
    load,
    signIn,
    cancelSignIn,
    signOut,
  } = useChatGpt();
  const available = session?.available;
  const connected = session?.connected;

  return (
    <div className="space-y-2" aria-busy={Boolean(busy || loading)}>
      {loading && !session && (
        <p role="status" className="text-sm text-muted-foreground">
          <Trans>Checking ChatGPT connection...</Trans>
        </p>
      )}
      {session && !available && (
        <p className="text-sm text-muted-foreground">
          <Trans>
            ChatGPT sign-in is available in the desktop app on Windows, macOS,
            and Linux.
          </Trans>
        </p>
      )}
      {available && (
        <>
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
            {(session.account || connected) && (
              <p
                role="status"
                className="min-w-0 flex-1 truncate text-sm text-muted-foreground"
                title={session.account?.email ?? undefined}
              >
                <bdi>
                  {session.account?.email ?? (
                    <Trans>ChatGPT account connected</Trans>
                  )}
                </bdi>
              </p>
            )}
            <div className="flex flex-wrap items-center gap-2">
              {busy === "signIn" ? (
                <>
                  <p
                    role="status"
                    className="inline-flex items-center gap-2 text-sm"
                  >
                    <Loader2Icon
                      className="size-4 animate-spin"
                      aria-hidden="true"
                    />
                    <Trans>Finish signing in in your browser...</Trans>
                  </p>
                  <Button variant="outline" onClick={cancelSignIn}>
                    <Trans>Cancel</Trans>
                  </Button>
                </>
              ) : (
                <>
                  {(!connected || !session.planUsageEnabled) && (
                    <Button
                      className="h-10 rounded-full bg-black px-4 text-white hover:bg-black/85 dark:bg-black dark:text-white"
                      disabled={Boolean(busy)}
                      onClick={() => void signIn()}
                    >
                      <img src={chatGptLogo} alt="" className="size-5" />
                      <Trans>Continue with ChatGPT</Trans>
                    </Button>
                  )}
                  {(session.account || connected) && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="shrink-0 text-muted-foreground"
                      disabled={Boolean(busy)}
                      onClick={() => void signOut()}
                    >
                      {busy === "signOut" ? (
                        <Trans>Disconnecting...</Trans>
                      ) : (
                        <Trans>Disconnect</Trans>
                      )}
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
          {connected && !session.planUsageEnabled && (
            <p role="alert" className="text-sm text-destructive">
              <Trans>
                ChatGPT plan usage is not enabled. Continue with ChatGPT to
                enable it.
              </Trans>
            </p>
          )}
        </>
      )}
      {error && (
        <div role="alert" className="space-y-2">
          <p className="break-words text-sm text-destructive">{error}</p>
          {!session && (
            <Button
              variant="outline"
              disabled={loading}
              onClick={() => void load()}
            >
              <Trans>Try again</Trans>
            </Button>
          )}
        </div>
      )}
      {revocationUnconfirmed && (
        <p role="status" className="text-sm text-muted-foreground">
          <Trans>
            Signed out on this device. To confirm remote access has ended,
            disconnect Hakawati in ChatGPT Settings → Security and login.
          </Trans>
        </p>
      )}
    </div>
  );
}

export function ChatGptPlanNotice() {
  const open = useChatGptStore((state) => state.showPlanNotice);
  const dismiss = useChatGptStore((state) => state.dismissPlanNotice);
  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        if (!value) dismiss();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            <Trans>You’re now using your ChatGPT plan!</Trans>
          </DialogTitle>
          <DialogDescription>
            <Trans>
              Hakawati will now consume resources from your ChatGPT plan when
              you have the ChatGPT subscription provider selected.
            </Trans>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button onClick={dismiss}>
            <Trans>Got it</Trans>
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

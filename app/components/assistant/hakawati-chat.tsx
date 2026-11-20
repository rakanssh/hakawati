import {
  memo,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { openUrl } from "@tauri-apps/plugin-opener";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import {
  BrainCircuitIcon,
  ChevronDownIcon,
  CircleAlertIcon,
  MessageCircleIcon,
  MessageSquarePlusIcon,
  SendIcon,
  SquareIcon,
  Trash2Icon,
} from "lucide-react";
import { LinkRow, SetupList } from "@/components/layout/settings/settings-rows";
import { RoleIcon } from "@/components/layout/settings/ai-setup/parts";
import { Button } from "@/components/ui/button";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { FezIcon } from "@/components/ui/fez-icon";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useIsMobile } from "@/hooks/useIsMobile";
import { clearDeletedTale, useLoadTale } from "@/hooks/useGameSaves";
import { useStickToBottom } from "@/hooks/useStickToBottom";
import { replyTimeline } from "@/lib/assistant-timeline";
import { cn } from "@/lib/utils";
import {
  removeAssistantThread,
  selectAssistantThread,
  sendAssistantMessage,
  startNewAssistantChat,
  stopAssistant,
  syncAssistantScope,
} from "@/services/assistant/session";
import type { AssistantUi } from "@/services/assistant/tools/define";
import { useAssistantStore } from "@/store/useAssistantStore";
import { useSettingsModalStore } from "@/store/useSettingsModalStore";
import { useStoryPanelStore } from "@/store/useStoryPanelStore";
import {
  isModelRoleConfigured,
  useSettingsStore,
} from "@/store/useSettingsStore";
import { useTaleStore } from "@/store/useTaleStore";
import type {
  AssistantActivity,
  AssistantChange,
  AssistantMessageStatus,
} from "@/types/assistant.type";
import { ActivityChip } from "./activity-chip";
import { ChangeList } from "./change-list";
import { ConfirmCard } from "./confirm-card";

function ErrorLine({ children }: { children: React.ReactNode }) {
  return (
    <p
      data-log-error=""
      role="alert"
      className="flex items-start gap-1.5 text-sm text-destructive"
    >
      <CircleAlertIcon
        aria-hidden="true"
        className="mt-[0.2em] size-[1em] shrink-0"
      />
      <span dir="auto" className="min-w-0 whitespace-pre-wrap break-words">
        {children}
      </span>
    </p>
  );
}

const REMARK_PLUGINS = [remarkGfm];

function Heading({ children }: { children?: React.ReactNode }) {
  return <p className="mt-3 mb-1 font-semibold">{children}</p>;
}

function useMarkdownComponents(): Components {
  const { t } = useLingui();
  return useMemo<Components>(
    () => ({
      p: ({ children }) => (
        <p className="my-2 first:mt-0 last:mb-0">{children}</p>
      ),
      ul: ({ children }) => (
        <ul className="my-2 list-disc space-y-1 ps-5">{children}</ul>
      ),
      ol: ({ children }) => (
        <ol className="my-2 list-decimal space-y-1 ps-5">{children}</ol>
      ),
      h1: Heading,
      h2: Heading,
      h3: Heading,
      h4: Heading,
      strong: ({ children }) => (
        <strong className="font-semibold text-sidebar-foreground">
          {children}
        </strong>
      ),
      blockquote: ({ children }) => (
        <blockquote className="my-2 border-s-2 border-border ps-3 text-muted-foreground">
          {children}
        </blockquote>
      ),
      code: ({ children }) => (
        <code className="rounded-xs bg-muted/70 px-1 py-px font-mono text-[0.85em]">
          {children}
        </code>
      ),
      pre: ({ children }) => (
        <pre className="my-2 max-w-full overflow-x-auto rounded-xs border border-border/60 bg-background/60 p-2.5 font-mono text-xs [&_code]:bg-transparent [&_code]:p-0">
          {children}
        </pre>
      ),
      hr: () => <hr className="my-3 border-border/60" />,
      table: ({ children }) => (
        <div className="my-2 max-w-full overflow-x-auto">
          <table className="w-full border-collapse text-xs">{children}</table>
        </div>
      ),
      th: ({ children }) => (
        <th className="border border-border/60 px-2 py-1 text-start font-semibold">
          {children}
        </th>
      ),
      td: ({ children }) => (
        <td className="border border-border/60 px-2 py-1">{children}</td>
      ),
      a: ({ href, children }) => (
        <a
          href={href}
          onClick={(event: MouseEvent<HTMLAnchorElement>) => {
            event.preventDefault();
            void openUrl(event.currentTarget.href).catch(() => {
              toast.error(t`Could not open the link`);
            });
          }}
          className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
        >
          {children}
        </a>
      ),
    }),
    [t],
  );
}

function PlayerMessage({ content }: { content: string }) {
  return (
    <div
      data-log-entry="chat"
      className="rounded-xs border border-s-2 border-border/60 border-s-primary/55 bg-card/65 px-3 py-2 shadow-sm backdrop-blur-sm"
    >
      <div className="flex items-start text-sm">
        <MessageCircleIcon
          data-log-entry-icon=""
          className="me-2 mt-[0.3125em] inline h-[1em] w-[1em] shrink-0 text-primary"
        />
        <div
          data-log-entry-text=""
          dir="auto"
          className="me-1 min-w-0 flex-1 whitespace-pre-wrap break-words [overflow-wrap:anywhere] leading-relaxed text-foreground/90"
        >
          {content}
        </div>
      </div>
    </div>
  );
}

const Reply = memo(function Reply({
  content,
  thinking,
  activity,
  changes,
  status,
  messageId,
  live,
  toolRunning,
}: {
  content: string;
  thinking?: string;
  activity?: AssistantActivity[];
  changes?: AssistantChange[];
  status?: AssistantMessageStatus;
  messageId?: string;
  live?: boolean;
  toolRunning?: boolean;
}) {
  const { t } = useLingui();
  const [thinkingOpen, setThinkingOpen] = useState(false);
  const thinkingVisibility = useSettingsStore(
    (state) => state.thinkingVisibility,
  );
  const components = useMarkdownComponents();
  const parts = replyTimeline(content, activity ?? [], Boolean(toolRunning));
  const showThinking = Boolean(thinking) && thinkingVisibility !== "none";
  const thinkingLive =
    showThinking && Boolean(live) && !content && !toolRunning;
  const lastPart = parts.at(-1);
  const caret = (
    <span
      data-log-caret=""
      className="ms-0.5 inline-block h-[1.1em] w-0.5 animate-pulse bg-primary/70 align-middle"
    />
  );
  const waiting =
    live && !toolRunning && !thinkingLive && lastPart?.kind !== "text";

  return (
    <div className="flex min-w-0 flex-col items-start gap-2">
      {parts.map((part, index) =>
        part.kind === "steps" ? (
          <div key={index} className="flex w-full flex-col gap-2">
            <div className="flex max-w-full flex-wrap gap-1">
              {part.steps.map((step, stepIndex) => (
                <ActivityChip
                  key={stepIndex}
                  activity={step.activity}
                  running={step.running}
                />
              ))}
            </div>
            {live
              ? part.steps.map(({ activity: step }, stepIndex) =>
                  step.confirm && !step.confirm.answer ? (
                    <ConfirmCard key={stepIndex} confirm={step.confirm} />
                  ) : null,
                )
              : null}
          </div>
        ) : (
          <div
            key={index}
            dir="auto"
            className="w-full text-sm leading-relaxed break-words [overflow-wrap:anywhere] text-sidebar-foreground/95"
          >
            <ReactMarkdown
              remarkPlugins={REMARK_PLUGINS}
              components={components}
            >
              {part.text}
            </ReactMarkdown>
            {live && part === lastPart ? caret : null}
          </div>
        ),
      )}
      {waiting ? caret : null}
      {showThinking || changes?.length ? (
        <Collapsible
          open={thinkingOpen}
          onOpenChange={setThinkingOpen}
          className="w-full"
        >
          <div
            data-log-meta=""
            className="flex w-full flex-wrap items-center gap-1.5"
          >
            {showThinking ? (
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="inline-flex h-7 items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
                  aria-label={t`Toggle thinking output`}
                >
                  <BrainCircuitIcon
                    className={cn(
                      "h-3.5 w-3.5",
                      thinkingLive && "animate-pulse text-primary",
                    )}
                  />
                  <span className={cn(thinkingLive && "animate-pulse")}>
                    <Trans>Thinking</Trans>
                  </span>
                  <ChevronDownIcon
                    className={cn(
                      "h-3.5 w-3.5 transition-transform",
                      thinkingOpen && "rotate-180",
                    )}
                  />
                </button>
              </CollapsibleTrigger>
            ) : null}
            {changes?.length ? (
              <ChangeList changes={changes} messageId={messageId} />
            ) : null}
          </div>
          {showThinking ? (
            <CollapsibleContent className="mt-1 rounded-xs border border-border/60 bg-card/60 p-2.5 shadow-sm backdrop-blur-sm">
              <p
                dir="auto"
                className="text-xs leading-relaxed whitespace-pre-wrap text-muted-foreground"
              >
                {thinking}
              </p>
            </CollapsibleContent>
          ) : null}
        </Collapsible>
      ) : null}
      {status === "stopped" ? (
        <p className="text-xs text-muted-foreground">
          <Trans>Stopped</Trans>
        </p>
      ) : status === "failed" ? (
        <ErrorLine>
          <Trans>Request failed</Trans>
        </ErrorLine>
      ) : null}
    </div>
  );
});

function Suggestions({
  isPlay,
  onPick,
}: {
  isPlay: boolean;
  onPick: (text: string) => void;
}) {
  const { t } = useLingui();
  const items = isPlay
    ? [
        t`Recap the story so far`,
        t`Who have I met so far?`,
        t`Add a twist to the plot`,
      ]
    : [t`Catch me up on my latest tale`, t`What scenarios do I have?`];
  return (
    <div className="flex w-full flex-col gap-1.5">
      {items.map((item) => (
        <button
          key={item}
          type="button"
          dir="auto"
          onClick={() => onPick(item)}
          className="rounded-xs border border-sidebar-border/80 bg-sidebar-accent/35 px-3 py-2 text-start text-sm text-sidebar-foreground/85 transition-colors hover:border-primary/45 hover:bg-sidebar-accent/70 hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none dark:border-sidebar-foreground/20 dark:bg-sidebar-accent/50"
        >
          {item}
        </button>
      ))}
    </div>
  );
}

function ChatMenu({ pathname }: { pathname: string }) {
  const { t } = useLingui();
  const threads = useAssistantStore((state) => state.threads);
  const threadId = useAssistantStore((state) => state.threadId);
  const running = useAssistantStore((state) => Boolean(state.run));
  const current = threads.find((thread) => thread.id === threadId);

  return (
    <div className="flex shrink-0 items-center gap-1 px-3 pt-2 pb-1">
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={running}>
          <Button
            variant="ghost"
            size="sm"
            className="h-8 min-w-0 flex-1 justify-between gap-1 px-2 text-sm font-medium text-sidebar-foreground/85 hover:text-sidebar-foreground"
          >
            <span dir="auto" className="truncate">
              {current?.title ?? t`New chat`}
            </span>
            <ChevronDownIcon className="size-3.5 shrink-0 opacity-60" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="max-h-80 w-64">
          {threads.map((thread) => (
            <DropdownMenuItem
              key={thread.id}
              onSelect={() => void selectAssistantThread(thread.id)}
              className={cn(thread.id === threadId && "font-semibold")}
            >
              <span dir="auto" className="truncate">
                {thread.title}
              </span>
            </DropdownMenuItem>
          ))}
          {current ? (
            <>
              {threads.length ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem
                variant="destructive"
                onSelect={() =>
                  void removeAssistantThread(current.id, pathname)
                }
              >
                <Trash2Icon className="size-4" />
                <Trans>Delete chat</Trans>
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-8 shrink-0 text-sidebar-foreground/70 hover:text-sidebar-foreground"
            disabled={running || !threadId}
            onClick={() => startNewAssistantChat(pathname)}
            aria-label={t`New chat`}
          >
            <MessageSquarePlusIcon className="size-4" />
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <Trans>New chat</Trans>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}

export function HakawatiChat() {
  const { t } = useLingui();
  const router = useRouter();
  const navigate = useNavigate();
  const { load: loadTale } = useLoadTale();
  const pathname = useRouterState({
    select: (state) => state.location.pathname ?? "/",
  });
  const isPlay = pathname.startsWith("/play");
  const taleId = useTaleStore((state) => state.id);
  const playTaleId = isPlay && taleId ? taleId : null;
  const messages = useAssistantStore((state) => state.messages);
  const run = useAssistantStore((state) => state.run);
  const error = useAssistantStore((state) => state.error);
  const configured = useSettingsStore((state) =>
    isModelRoleConfigured(state.modelRoles.hakawati),
  );
  const { isMobilePlatform } = useIsMobile();
  const openSettings = useSettingsModalStore((state) => state.openSettings);
  const last = messages.at(-1);
  const canContinue =
    configured &&
    !run &&
    last?.role === "assistant" &&
    last.status === "paused";
  const { viewportRef, handleScroll, stickToBottom, scrollToBottom } =
    useStickToBottom({ scrollBehavior: "auto" });

  useEffect(() => {
    void syncAssistantScope(playTaleId);
  }, [playTaleId]);

  useEffect(() => {
    if (stickToBottom) scrollToBottom("auto");
  }, [messages, run, error, stickToBottom, scrollToBottom]);

  const closePanelOnPhone = () => {
    if (isMobilePlatform) useStoryPanelStore.getState().setOpen(false);
  };
  const ui: AssistantUi = {
    navigate: async (to, options) => {
      closePanelOnPhone();
      await navigate({
        to,
        ...(options?.search ? { search: options.search } : {}),
        ...(options?.state
          ? { state: (previous) => ({ ...(previous ?? {}), ...options.state }) }
          : {}),
      } as Parameters<typeof navigate>[0]);
    },
    openTale: async (taleId) => {
      await loadTale(taleId);
      useStoryPanelStore.getState().setTab("hakawati");
      closePanelOnPhone();
      await navigate({ to: "/play" });
    },
    forgetTale: clearDeletedTale,
    showSettings: (tab) => {
      closePanelOnPhone();
      openSettings(tab);
    },
    showPanelTab: (tab) => {
      const panel = useStoryPanelStore.getState();
      panel.setTab(tab);
      panel.setOpen(true);
    },
  };

  const send = (text: string) => {
    if (!configured || run) return;
    void sendAssistantMessage(text, {
      getPathname: () => router.state.location.pathname,
      ui,
    });
    scrollToBottom("auto");
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ChatMenu pathname={pathname} />
      <div
        ref={viewportRef}
        onScroll={handleScroll}
        className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-4 pt-2 pb-4"
      >
        {messages.length === 0 && !run && !error ? (
          <div className="flex h-full flex-col">
            <div className="flex flex-1 items-center justify-center">
              <FezIcon className="size-12 text-sidebar-foreground/20" />
            </div>
            {configured ? (
              <Suggestions isPlay={isPlay} onPick={(text) => send(text)} />
            ) : null}
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            {messages.map((message) =>
              message.role === "user" ? (
                <PlayerMessage key={message.id} content={message.content} />
              ) : (
                <Reply
                  key={message.id}
                  content={message.content}
                  thinking={message.thinking}
                  activity={message.activity}
                  changes={message.changes}
                  status={message.status}
                  messageId={message.id}
                />
              ),
            )}
            {canContinue ? (
              <Button
                variant="outline"
                size="sm"
                className="self-start"
                onClick={() => send(t`Continue`)}
              >
                <Trans>Continue</Trans>
              </Button>
            ) : null}
            {run ? (
              <Reply
                content={run.content}
                thinking={run.thinking}
                activity={run.activity}
                changes={run.changes}
                live
                toolRunning={run.toolRunning}
              />
            ) : null}
            {error ? <ErrorLine>{error}</ErrorLine> : null}
          </div>
        )}
      </div>
      <div className="flex shrink-0 flex-col gap-2 px-3 pt-1 pb-3">
        {configured ? null : (
          <SetupList>
            <LinkRow
              leading={<RoleIcon role="hakawati" off />}
              title={<Trans>Set up Hakawati</Trans>}
              onClick={() => openSettings("ai-setup")}
            />
          </SetupList>
        )}
        <Composer
          configured={configured}
          running={Boolean(run)}
          onSend={send}
        />
      </div>
    </div>
  );
}

/** The message box, apart from the chat so typing doesn't re-render the replies. */
function Composer({
  configured,
  running,
  onSend,
}: {
  configured: boolean;
  running: boolean;
  onSend: (text: string) => void;
}) {
  const { t } = useLingui();
  const draft = useAssistantStore((state) => state.draft);
  const setDraft = useAssistantStore((state) => state.setDraft);
  const focusComposer = useAssistantStore((state) => state.focusComposer);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const { isMobilePlatform } = useIsMobile();

  useEffect(() => {
    if (!focusComposer) return;
    const timer = window.setTimeout(() => {
      composerRef.current?.focus();
      useAssistantStore.getState().clearComposerFocus();
    });
    return () => window.clearTimeout(timer);
  }, [focusComposer]);

  return (
    <div
      data-composer-surface=""
      className="flex min-w-0 items-end gap-1 overflow-hidden rounded-xs border border-border/75 bg-[var(--composer-background)] p-1 shadow-lg shadow-background/25 transition-[border-color,box-shadow] focus-within:border-ring/55 focus-within:ring-2 focus-within:ring-ring/18"
    >
      <Textarea
        ref={composerRef}
        data-hakawati-composer=""
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !isMobilePlatform) {
            event.preventDefault();
            onSend(draft);
          }
        }}
        rows={1}
        disabled={!configured}
        placeholder={t`Ask Hakawati`}
        aria-label={t`Message Hakawati`}
        className="max-h-40 min-h-10 resize-none border-0 !bg-transparent px-2.5 py-2 text-sm shadow-none focus-visible:border-transparent focus-visible:ring-0 md:text-sm dark:!bg-transparent"
      />
      {running ? (
        <Button
          type="button"
          size="icon"
          data-composer-send=""
          className="size-10 shrink-0 rounded-xs"
          onClick={stopAssistant}
          aria-label={t`Stop`}
        >
          <SquareIcon className="size-4 fill-current" />
        </Button>
      ) : (
        <Button
          type="button"
          size="icon"
          data-composer-send=""
          className="size-10 shrink-0 rounded-xs"
          disabled={!configured || !draft.trim()}
          onClick={() => onSend(draft)}
          aria-label={t`Send`}
        >
          <SendIcon className="size-4" />
        </Button>
      )}
    </div>
  );
}

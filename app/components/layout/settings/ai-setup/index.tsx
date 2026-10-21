import { useEffect } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useLingui as useLinguiCore } from "@lingui/react";
import { PlusIcon } from "lucide-react";
import { apiPresetMap } from "@/data/api-presets";
import { cn } from "@/lib/utils";
import { useChatGpt } from "@/hooks/useChatGpt";
import { findConnection } from "@/store/model-connections";
import {
  isModelRoleConfigured,
  useSettingsStore,
} from "@/store/useSettingsStore";
import { ApiConnection, ApiPreset, MODEL_ROLES, type ModelRole } from "@/types";
import { useSettingsNavigation } from "../settings-shell";
import { ChatGptPlanNotice } from "../chatgpt-connection";
import { AddConnection } from "./add-connection";
import { ConnectionPage, NewConnectionPage } from "./connection-page";
import { pageKey, parsePage, type AiSetupPage } from "./pages";
import { RoleScreen } from "./role-page";
import {
  LinkRow,
  ProviderBadge,
  RoleIcon,
  RoleName,
  SetupList,
  SetupSection,
  StatusBanner,
  keyTail,
  useConnectionNames,
} from "./parts";

function RoleDescription({ role }: { role: ModelRole }) {
  switch (role) {
    case "narrator":
      return <Trans>Writes the story</Trans>;
    case "utility":
      return <Trans>Scenarios, story cards, summaries</Trans>;
    default:
      return null;
  }
}

const isSpeechRole = (role: ModelRole) =>
  role === "speechToText" || role === "textToSpeech";

function Overview() {
  const { t } = useLingui();
  const navigation = useSettingsNavigation();
  const connections = useSettingsStore((state) => state.connections);
  const assignments = useSettingsStore((state) => state.roleAssignments);
  const modelRoles = useSettingsStore((state) => state.modelRoles);
  const name = useConnectionNames();
  const hasChatGpt = connections.some((c) => c.preset === ApiPreset.CHATGPT);
  const { session } = useChatGpt(hasChatGpt);
  const signedIn = Boolean(session?.connected && session.planUsageEnabled);
  const open = (page: AiSetupPage) => navigation.push(pageKey(page));

  function roleSummary(role: ModelRole) {
    if (role === "utility" && assignments.utility.sameAsNarrator) {
      return t`Same as Narrator`;
    }
    const config = modelRoles[role];
    const connection = findConnection(connections, config.connectionId);
    if (!connection) return isSpeechRole(role) ? t`Off` : t`Not set up`;
    return `${name(connection)} · ${config.model?.name ?? t`No model`}`;
  }

  function connectionSummary(connection: ApiConnection) {
    if (connection.preset === ApiPreset.CHATGPT) {
      return signedIn
        ? { text: t`Signed in`, className: "text-success" }
        : { text: t`Not signed in`, className: "text-destructive" };
    }
    if (connection.apiKey) {
      const tail = keyTail(connection.apiKey);
      return { text: t`Key saved · ends ${tail}` };
    }
    if (apiPresetMap[connection.preset].editableUrl) {
      return { text: connection.label ? connection.baseUrl : undefined };
    }
    return { text: t`No key`, className: "text-destructive" };
  }

  return (
    <div className="@container flex flex-col gap-6">
      {isModelRoleConfigured(modelRoles.narrator) ? (
        <StatusBanner tone="success" title={<Trans>Ready to play</Trans>} />
      ) : (
        <button
          type="button"
          className="text-start"
          onClick={() =>
            open(
              connections.length > 0
                ? { kind: "role", role: "narrator" }
                : { kind: "add" },
            )
          }
        >
          <StatusBanner
            tone="destructive"
            title={<Trans>Set up the Narrator to play</Trans>}
          />
        </button>
      )}

      <div className="grid gap-6 @3xl:grid-cols-2 @3xl:items-start">
        <SetupSection title={<Trans>Roles</Trans>}>
          <SetupList className="@container/list">
            {MODEL_ROLES.map((role) => {
              const summary = roleSummary(role);
              const off =
                modelRoles[role].connectionId === null &&
                !(role === "utility" && assignments.utility.sameAsNarrator);
              const described = role === "narrator" || role === "utility";
              const summaryClass =
                off && !isSpeechRole(role) ? "text-destructive" : undefined;
              return (
                <LinkRow
                  key={role}
                  leading={<RoleIcon role={role} off={off} />}
                  title={<RoleName role={role} />}
                  detail={
                    described ? (
                      <>
                        <span className={cn("@sm/list:hidden", summaryClass)}>
                          {summary}
                        </span>
                        <span className="hidden @sm/list:inline">
                          <RoleDescription role={role} />
                        </span>
                      </>
                    ) : (
                      summary
                    )
                  }
                  trailing={
                    described ? (
                      <span
                        className={cn(
                          "hidden max-w-[45%] truncate text-[0.8rem] text-muted-foreground @sm/list:block",
                          summaryClass,
                        )}
                      >
                        {summary}
                      </span>
                    ) : undefined
                  }
                  onClick={() => open({ kind: "role", role })}
                />
              );
            })}
          </SetupList>
        </SetupSection>

        <SetupSection title={<Trans>Connections</Trans>}>
          <SetupList>
            {connections.map((connection) => {
              const summary = connectionSummary(connection);
              return (
                <LinkRow
                  key={connection.id}
                  leading={<ProviderBadge preset={connection.preset} />}
                  title={name(connection)}
                  detail={summary.text}
                  detailClassName={summary.className}
                  onClick={() =>
                    open({ kind: "connection", id: connection.id })
                  }
                />
              );
            })}
            <button
              type="button"
              onClick={() => open({ kind: "add" })}
              className="flex min-h-12 w-full items-center gap-3 px-3.5 py-2 text-start text-sm font-semibold text-primary transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none"
            >
              <span className="flex size-9 shrink-0 items-center justify-center">
                <PlusIcon aria-hidden="true" className="size-4" />
              </span>
              <Trans>Add a connection</Trans>
            </button>
          </SetupList>
        </SetupSection>
      </div>
    </div>
  );
}

/** Heads AI Setup's subpages in the settings header. */
export function AiSetupTitle({ page: key }: { page: string }) {
  const { _ } = useLinguiCore();
  const page = parsePage(key);
  const connection = useSettingsStore((state) =>
    page?.kind === "connection"
      ? findConnection(state.connections, page.id)
      : undefined,
  );
  const name = useConnectionNames();
  switch (page?.kind) {
    case "role":
      return <RoleName role={page.role} />;
    case "models":
      return <Trans>Choose a model</Trans>;
    case "add":
      return <Trans>Add a connection</Trans>;
    case "new":
      return <>{_(apiPresetMap[page.preset].label)}</>;
    case "connection":
      return connection ? <>{name(connection)}</> : null;
    default:
      return <Trans>AI Setup</Trans>;
  }
}

function MissingPage() {
  const navigation = useSettingsNavigation();
  useEffect(() => navigation.reset(), [navigation]);
  return null;
}

export default function SettingsAiSetup() {
  const navigation = useSettingsNavigation();
  const page = parsePage(navigation.page);
  const connectionExists = useSettingsStore((state) =>
    page?.kind === "connection"
      ? Boolean(findConnection(state.connections, page.id))
      : true,
  );

  let content;
  if (!navigation.page) {
    content = <Overview />;
  } else if (!page || !connectionExists) {
    content = <MissingPage />;
  } else if (page.kind === "role" || page.kind === "models") {
    content = <RoleScreen role={page.role} picking={page.kind === "models"} />;
  } else if (page.kind === "add") {
    content = <AddConnection role={page.role} />;
  } else if (page.kind === "new") {
    content = <NewConnectionPage preset={page.preset} role={page.role} />;
  } else {
    content = <ConnectionPage id={page.id} />;
  }

  return (
    <>
      {content}
      <ChatGptPlanNotice />
    </>
  );
}

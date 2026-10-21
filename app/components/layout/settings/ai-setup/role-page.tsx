import { Trans, useLingui } from "@lingui/react/macro";
import { PlusIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { isPresetAllowedForRole } from "@/data/api-presets";
import { cn } from "@/lib/utils";
import { useLLMProviders } from "@/hooks/useLLMProviders";
import {
  getModelReasoning,
  normalizeReasoningEffort,
  reasoningProvider,
} from "@/services/llm/reasoning";
import type { ReasoningEffort } from "@/services/llm/schema";
import { usesReasoning } from "@/store/model-connections";
import { useSettingsStore } from "@/store/useSettingsStore";
import { ApiPreset, type ModelRole } from "@/types";
import { useSettingsNavigation } from "../settings-shell";
import { ChatGptUsageLink } from "../chatgpt-connection";
import { EffortLabel } from "../thinking-level";
import { ModelPicker, useDescribeModel } from "./model-picker";
import { pageKey } from "./pages";
import { ProviderBadge, RoleIcon, useConnectionNames } from "./parts";
import {
  LinkRow,
  PlainRow,
  RadioRow,
  RowText,
  Segmented,
  SetupList,
  SetupSection,
  ToggleSwitch,
} from "../settings-rows";

type Providers = ReturnType<typeof useLLMProviders>;

const CUSTOM_VOICE = "__custom__";

function ConnectionChooser({ role }: { role: ModelRole }) {
  const { t } = useLingui();
  const navigation = useSettingsNavigation();
  const connections = useSettingsStore((state) => state.connections);
  const assignment = useSettingsStore((state) => state.roleAssignments[role]);
  const setRoleConnection = useSettingsStore(
    (state) => state.setRoleConnection,
  );
  const setUtilitySameAsNarrator = useSettingsStore(
    (state) => state.setUtilitySameAsNarrator,
  );
  const allowed = connections.filter((connection) =>
    isPresetAllowedForRole(connection.preset, role),
  );
  const following = role === "utility" && Boolean(assignment.sameAsNarrator);
  const current =
    !following && allowed.some((c) => c.id === assignment.connectionId)
      ? assignment.connectionId
      : null;
  const name = useConnectionNames();
  const hasOptions = role !== "narrator" || allowed.length > 0;

  return (
    <SetupSection title={<Trans>Connection</Trans>}>
      <SetupList>
        <div role="radiogroup" aria-label={t`Connection`} className="contents">
          {role === "utility" && (
            <RadioRow
              leading={<RoleIcon role="narrator" />}
              title={<Trans>Same as Narrator</Trans>}
              checked={following}
              onClick={() => setUtilitySameAsNarrator(true)}
            />
          )}
          {(role === "speechToText" || role === "textToSpeech") && (
            <RadioRow
              leading={<RoleIcon role={role} off />}
              title={<Trans>Off</Trans>}
              checked={current === null}
              onClick={() => setRoleConnection(role, null)}
            />
          )}
          {allowed.map((connection) => (
            <RadioRow
              key={connection.id}
              leading={<ProviderBadge preset={connection.preset} />}
              title={name(connection)}
              checked={current === connection.id}
              onClick={() => setRoleConnection(role, connection.id)}
            />
          ))}
        </div>
        <button
          type="button"
          onClick={() => navigation.push(pageKey({ kind: "add", role }))}
          className={cn(
            "flex min-h-12 w-full items-center gap-3 px-3.5 py-2 text-start text-sm font-semibold text-primary transition-colors hover:bg-accent/60 focus-visible:bg-accent/60 focus-visible:outline-none",
            hasOptions && "border-t border-border/60",
          )}
        >
          <span className="flex size-9 shrink-0 items-center justify-center">
            <PlusIcon aria-hidden="true" className="size-4" />
          </span>
          <Trans>Add a connection</Trans>
        </button>
      </SetupList>
    </SetupSection>
  );
}

function ModelSection({
  role,
  providers,
}: {
  role: ModelRole;
  providers: Providers;
}) {
  const { t } = useLingui();
  const navigation = useSettingsNavigation();
  const config = useSettingsStore((state) => state.modelRoles[role]);
  const describe = useDescribeModel(role);
  const { loading, error, enabled } = providers;
  const isChatGpt = config.activePreset === ApiPreset.CHATGPT;

  if (isChatGpt && !enabled && config.connectionId) {
    const id = config.connectionId;
    return (
      <SetupSection title={<Trans>Model</Trans>}>
        <SetupList>
          <LinkRow
            title={<Trans>Sign in to ChatGPT</Trans>}
            detail={<Trans>Models appear once you’re signed in</Trans>}
            onClick={() => navigation.push(pageKey({ kind: "connection", id }))}
          />
        </SetupList>
      </SetupSection>
    );
  }

  return (
    <SetupSection title={<Trans>Model</Trans>}>
      <SetupList>
        <LinkRow
          title={
            config.model?.name ??
            (loading ? t`Loading models…` : t`Choose a model`)
          }
          detail={
            config.model ? describe(config.model, "abilities") : undefined
          }
          trailing={
            config.model ? (
              <span className="shrink-0 text-sm text-primary">
                <Trans>Change</Trans>
              </span>
            ) : undefined
          }
          disabled={!enabled}
          onClick={() => navigation.push(pageKey({ kind: "models", role }))}
        />
      </SetupList>
      {error && (
        <p role="alert" className="px-0.5 text-sm text-destructive">
          {error}
        </p>
      )}
      {isChatGpt && (
        <div className="px-0.5 text-muted-foreground">
          <ChatGptUsageLink />
        </div>
      )}
    </SetupSection>
  );
}

function ThinkingSection({ role }: { role: "narrator" | "utility" }) {
  const { t } = useLingui();
  const config = useSettingsStore((state) => state.modelRoles[role]);
  const maxTokens = useSettingsStore((state) => state.maxTokens);
  const setRoleReasoningEffort = useSettingsStore(
    (state) => state.setRoleReasoningEffort,
  );
  const isChatGpt = config.activePreset === ApiPreset.CHATGPT;
  const capabilities = getModelReasoning(
    config.model,
    reasoningProvider(config.baseUrl, isChatGpt),
  );
  const efforts = capabilities?.supportedEfforts ?? [];
  if (efforts.length === 0) return null;
  const effort = normalizeReasoningEffort(config.reasoningEffort, capabilities);
  const hasLowOutputLimit =
    role === "narrator" &&
    !isChatGpt &&
    effort !== undefined &&
    effort !== "none" &&
    maxTokens < 8192;

  return (
    <SetupSection title={<Trans>Thinking</Trans>}>
      <Segmented<ReasoningEffort | "default">
        label={t`Thinking`}
        value={effort ?? "default"}
        options={[
          { value: "default", label: <Trans>Default</Trans> },
          ...efforts.map((value) => ({
            value,
            label: <EffortLabel effort={value} />,
          })),
        ]}
        onChange={(value) =>
          setRoleReasoningEffort(role, value === "default" ? undefined : value)
        }
      />
      {hasLowOutputLimit && (
        <p className="px-0.5 text-sm leading-relaxed text-muted-foreground">
          <Trans>
            Thinking and the answer share your output limit. Increase Max Output
            Tokens if responses are cut short.
          </Trans>
        </p>
      )}
    </SetupSection>
  );
}

function NarrationSection() {
  const { t } = useLingui();
  const autoNarrate = useSettingsStore((state) => state.autoNarrate);
  const setAutoNarrate = useSettingsStore((state) => state.setAutoNarrate);
  return (
    <SetupSection title={<Trans>Narration</Trans>}>
      <SetupList>
        <PlainRow>
          <RowText title={<Trans>Read new narration aloud</Trans>} />
          <ToggleSwitch
            checked={autoNarrate}
            onCheckedChange={setAutoNarrate}
            label={t`Read new narration aloud`}
          />
        </PlainRow>
      </SetupList>
    </SetupSection>
  );
}

function VoiceSection() {
  const { t } = useLingui();
  const config = useSettingsStore((state) => state.modelRoles.textToSpeech);
  const setRoleVoice = useSettingsStore((state) => state.setRoleVoice);
  const voices = config.model?.supportedVoices ?? [];
  const voice = config.voice ?? "";
  const listed = voices.includes(voice);

  return (
    <SetupSection title={<Trans>Voice</Trans>}>
      {voices.length > 0 && (
        <Select
          value={listed ? voice : CUSTOM_VOICE}
          onValueChange={(value) =>
            setRoleVoice("textToSpeech", value === CUSTOM_VOICE ? "" : value)
          }
        >
          <SelectTrigger className="h-11 w-full sm:w-64" aria-label={t`Voice`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {voices.map((option) => (
              <SelectItem key={option} value={option}>
                {option}
              </SelectItem>
            ))}
            <SelectItem value={CUSTOM_VOICE}>
              <Trans>Other</Trans>
            </SelectItem>
          </SelectContent>
        </Select>
      )}
      {(!listed || voices.length === 0) && (
        <Input
          value={voice}
          onChange={(event) => setRoleVoice("textToSpeech", event.target.value)}
          placeholder="alloy"
          aria-label={t`Voice id`}
          className="h-11 sm:w-64"
        />
      )}
    </SetupSection>
  );
}

function RoleWithModels({
  role,
  picking,
}: {
  role: ModelRole;
  picking: boolean;
}) {
  const navigation = useSettingsNavigation();
  const providers = useLLMProviders(role);
  if (picking) {
    return (
      <ModelPicker
        role={role}
        providers={providers}
        onPicked={navigation.back}
      />
    );
  }
  return (
    <div className="flex flex-col gap-6">
      <ConnectionChooser role={role} />
      <ModelSection role={role} providers={providers} />
      {usesReasoning(role) && (
        <ThinkingSection role={role as "narrator" | "utility"} />
      )}
      {role === "textToSpeech" && <VoiceSection />}
      {role === "textToSpeech" && <NarrationSection />}
    </div>
  );
}

/** A role's page, and its model list when picking: one component, so both share the fetched models. */
export function RoleScreen({
  role,
  picking,
}: {
  role: ModelRole;
  picking: boolean;
}) {
  const connected = useSettingsStore(
    (state) =>
      state.modelRoles[role].connectionId !== null &&
      !(role === "utility" && state.roleAssignments.utility.sameAsNarrator),
  );
  if (!connected) {
    return (
      <div className="flex flex-col gap-6">
        <ConnectionChooser role={role} />
      </div>
    );
  }
  return <RoleWithModels role={role} picking={picking} />;
}

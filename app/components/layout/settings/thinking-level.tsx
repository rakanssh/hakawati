import { Trans, useLingui } from "@lingui/react/macro";
import {
  getModelReasoning,
  normalizeReasoningEffort,
  reasoningProvider,
} from "@/lib/reasoning";
import type { ReasoningEffort } from "@/types";
import { useSettingsStore } from "@/store/useSettingsStore";
import { ApiPreset } from "@/types/api.type";
import { Segmented, SetupSection } from "./settings-rows";

export function EffortLabel({ effort }: { effort: ReasoningEffort }) {
  switch (effort) {
    case "none":
      return <Trans>None</Trans>;
    case "minimal":
      return <Trans>Minimal</Trans>;
    case "low":
      return <Trans>Low</Trans>;
    case "medium":
      return <Trans>Medium</Trans>;
    case "high":
      return <Trans>High</Trans>;
    case "xhigh":
      return <Trans>Extra high</Trans>;
    case "max":
      return <Trans>Maximum</Trans>;
  }
}

/** The thinking levels the role's model offers; hidden when it offers none. */
export function ThinkingLevel({ role }: { role: "narrator" | "utility" }) {
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
            Thinking and the answer share your output limit. Raise Max output
            tokens in Generation if replies are cut short.
          </Trans>
        </p>
      )}
    </SetupSection>
  );
}

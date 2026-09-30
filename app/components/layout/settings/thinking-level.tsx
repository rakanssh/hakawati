import { Trans } from "@lingui/react/macro";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  getModelReasoning,
  normalizeReasoningEffort,
  reasoningProvider,
} from "@/services/llm/reasoning";
import type { ReasoningEffort } from "@/services/llm/schema";
import { useSettingsStore } from "@/store/useSettingsStore";
import { ApiPreset } from "@/types/api.type";
import { SettingsField } from "./settings-layout";

const MODEL_DEFAULT = "model-default";

function EffortLabel({ effort }: { effort: ReasoningEffort }) {
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

export function ThinkingLevel({ role }: { role: "narrator" | "utility" }) {
  const config = useSettingsStore((state) => state.modelRoles[role]);
  const setRoleReasoningEffort = useSettingsStore(
    (state) => state.setRoleReasoningEffort,
  );
  const maxTokens = useSettingsStore((state) => state.maxTokens);
  const isChatGpt = config.activePreset === ApiPreset.CHATGPT;
  const capabilities = getModelReasoning(
    config.model,
    reasoningProvider(config.baseUrl, isChatGpt),
  );
  const efforts = capabilities?.supportedEfforts ?? [];
  const effort = normalizeReasoningEffort(config.reasoningEffort, capabilities);
  const id = `${role}-thinking-level`;
  const hasLowOutputLimit =
    role === "narrator" &&
    !isChatGpt &&
    effort !== undefined &&
    effort !== "none" &&
    maxTokens < 8192;

  return (
    <SettingsField label={<Trans>Thinking level</Trans>} htmlFor={id}>
      <Select
        value={effort ?? MODEL_DEFAULT}
        disabled={efforts.length === 0}
        onValueChange={(value) =>
          setRoleReasoningEffort(
            role,
            value === MODEL_DEFAULT ? undefined : (value as ReasoningEffort),
          )
        }
      >
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={MODEL_DEFAULT}>
            <Trans>Model default</Trans>
          </SelectItem>
          {efforts.map((value) => (
            <SelectItem key={value} value={value}>
              <EffortLabel effort={value} />
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {hasLowOutputLimit && (
        <p className="text-sm leading-relaxed text-muted-foreground">
          <Trans>
            Thinking and the answer share your output limit. Increase Max Output
            Tokens if responses are cut short.
          </Trans>
        </p>
      )}
    </SettingsField>
  );
}

import { Input } from "@/components/ui/input";
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { ModelSelect } from "@/components/layout";
import { useSettingsStore } from "@/store";
import { ApiPreset, ModelRole } from "@/types/api.type";
import { apiPresetMap, getApiPresetsForRole } from "@/data/api-presets";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { useLocalServerDiscovery } from "@/hooks/useLocalServerDiscovery";
import { ProviderHelpModal } from "./provider-help-modal";
import { Eye, EyeOff } from "lucide-react";
import { Trans, useLingui } from "@lingui/react/macro";
import { useLingui as useLinguiCore } from "@lingui/react";
import {
  SettingsField,
  SettingsPanel,
  SettingsStack,
} from "@/components/layout/settings/settings-layout";

function RoleTitle({ role }: { role: ModelRole }) {
  switch (role) {
    case "narrator":
      return <Trans>Narrator</Trans>;
    case "utility":
      return <Trans>Utility</Trans>;
    case "speechToText":
      return <Trans>Speech to Text</Trans>;
    case "textToSpeech":
      return <Trans>Text to Speech</Trans>;
  }
}

function RoleHelp({ role }: { role: ModelRole }) {
  switch (role) {
    case "narrator":
      return <Trans>This model is used to generate story.</Trans>;
    case "utility":
      return (
        <Trans>
          This model is used for miscellaneous actions like generating scenarios
          and story cards.
        </Trans>
      );
    case "speechToText":
      return (
        <Trans>
          This model transcribes recorded speech into text for the input box.
        </Trans>
      );
    case "textToSpeech":
      return <Trans>This model will be used for spoken narration.</Trans>;
  }
}

function RoleApiSettings({ role }: { role: ModelRole }) {
  const { t } = useLingui();
  const { _ } = useLinguiCore();
  const roleConfig = useSettingsStore((state) => state.modelRoles[role]);
  const setRoleActivePreset = useSettingsStore(
    (state) => state.setRoleActivePreset,
  );
  const setRoleApiKey = useSettingsStore((state) => state.setRoleApiKey);
  const setRoleBaseUrl = useSettingsStore((state) => state.setRoleBaseUrl);
  const setRoleVoice = useSettingsStore((state) => state.setRoleVoice);
  const [baseUrl, setBaseUrl] = useState(roleConfig.baseUrl);
  const [showApiKey, setShowApiKey] = useState(false);
  const { servers, scanning, error, scan } = useLocalServerDiscovery(
    roleConfig.apiType,
  );

  const isLocalPreset = roleConfig.activePreset === ApiPreset.LOCAL;
  const isEditableUrl =
    apiPresetMap[roleConfig.activePreset]?.editableUrl ?? false;
  const roleApiPresets = getApiPresetsForRole(role);
  const activePresetAllowed = roleApiPresets.some(
    (preset) => preset.id === roleConfig.activePreset,
  );
  const titleWithHelp = (
    <span className="inline-flex items-center gap-2 text-foreground">
      <RoleTitle role={role} />
      <HelpTooltip>
        <RoleHelp role={role} />
      </HelpTooltip>
    </span>
  );
  const supportedVoices = roleConfig.model?.supportedVoices ?? [];
  const voiceListId = `tts-voices-${role}`;

  useEffect(() => {
    setBaseUrl(roleConfig.baseUrl);
  }, [roleConfig.baseUrl]);

  useEffect(() => {
    if (
      isLocalPreset &&
      roleConfig.apiType &&
      servers.length === 0 &&
      !scanning
    ) {
      scan();
    }
  }, [isLocalPreset, roleConfig.apiType, scan, scanning, servers.length]);

  useEffect(() => {
    if (!activePresetAllowed) {
      setRoleActivePreset(role, ApiPreset.GENERIC);
    }
  }, [activePresetAllowed, role, setRoleActivePreset]);

  function handleUrlChange(newUrl: string) {
    setRoleBaseUrl(role, newUrl);
  }

  return (
    <SettingsPanel title={titleWithHelp}>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)]">
        <SettingsField label={<Trans>Provider</Trans>}>
          <Select
            value={roleConfig.activePreset}
            onValueChange={(value) =>
              setRoleActivePreset(role, value as ApiPreset)
            }
          >
            <SelectTrigger className="w-full">
              <SelectValue placeholder={t`Select a provider`} />
            </SelectTrigger>
            <SelectContent>
              {roleApiPresets.map((preset) => (
                <SelectItem key={preset.id} value={preset.id}>
                  {_(preset.label)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </SettingsField>
        <SettingsField label={<Trans>Base URL</Trans>}>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              onBlur={() => {
                if (
                  isEditableUrl &&
                  baseUrl.trim() !== roleConfig.baseUrl.trim()
                ) {
                  handleUrlChange(baseUrl);
                }
              }}
              onKeyDown={(e) => {
                if (isEditableUrl && e.key === "Enter") {
                  handleUrlChange(baseUrl);
                }
              }}
              placeholder={isLocalPreset ? t`http://localhost:11434/v1` : ""}
              disabled={!isEditableUrl}
            />
            {isEditableUrl && (
              <Button
                variant="outline"
                onClick={() => handleUrlChange(baseUrl)}
                disabled={
                  !baseUrl?.trim() ||
                  baseUrl.trim() === roleConfig.baseUrl.trim()
                }
                className="shrink-0"
              >
                <Trans>Set</Trans>
              </Button>
            )}
          </div>
        </SettingsField>
      </div>

      {isLocalPreset && (
        <div className="flex flex-col gap-3 rounded-xs border border-border/70 p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-medium">
              <Trans>Local API servers</Trans>
            </span>
            <Button
              variant="outline"
              onClick={() => scan()}
              disabled={scanning}
            >
              {scanning ? <Trans>Scanning...</Trans> : <Trans>Rescan</Trans>}
            </Button>
          </div>
          {!!error && <span className="text-xs text-destructive">{error}</span>}
          {scanning && servers.length === 0 && (
            <span className="text-sm text-muted-foreground">
              <Trans>Scanning for local servers...</Trans>
            </span>
          )}
          {!scanning && servers.length === 0 && (
            <span className="text-sm text-muted-foreground">
              <Trans>No local servers found.</Trans>
            </span>
          )}
          {servers.length > 0 && (
            <div className="flex flex-col gap-2">
              {servers.map((s) => (
                <div
                  key={s.baseUrl}
                  className="flex items-center justify-between rounded-xs border p-2"
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm">{s.label}</span>
                    <span className="break-all text-xs text-muted-foreground">
                      {s.baseUrl} {s.requiresAuth ? t`(auth required)` : ""}
                    </span>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => handleUrlChange(s.baseUrl)}
                    disabled={roleConfig.baseUrl.trim() === s.baseUrl.trim()}
                    className="shrink-0"
                  >
                    <Trans>Use</Trans>
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="flex flex-col gap-4">
        <SettingsField
          label={<Trans>API Key</Trans>}
          description={
            isLocalPreset ? (
              <Trans>Optional for most local servers.</Trans>
            ) : undefined
          }
        >
          <div className="flex gap-2">
            <div className="relative flex-1">
              <Input
                type={showApiKey ? "text" : "password"}
                value={roleConfig.apiKey}
                onChange={(e) => setRoleApiKey(role, e.target.value)}
                placeholder={
                  isLocalPreset ? t`Optional for most local servers` : ""
                }
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
                aria-label={showApiKey ? t`Hide API key` : t`Show API key`}
              >
                {showApiKey ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>
            {apiPresetMap[roleConfig.activePreset]?.help && (
              <ProviderHelpModal
                preset={apiPresetMap[roleConfig.activePreset]}
              />
            )}
          </div>
        </SettingsField>
        <SettingsField label={<Trans>Model</Trans>}>
          <ModelSelect role={role} />
        </SettingsField>
        {role === "textToSpeech" && (
          <SettingsField
            label={<Trans>Voice</Trans>}
            description={
              supportedVoices.length > 0 ? (
                <Trans>
                  This model publishes supported voices. Pick one from the
                  suggestions.
                </Trans>
              ) : (
                <Trans>
                  Provider voice id for speech generation. OpenAI-compatible
                  providers commonly support alloy.
                </Trans>
              )
            }
          >
            <Input
              list={supportedVoices.length > 0 ? voiceListId : undefined}
              value={roleConfig.voice ?? ""}
              onChange={(e) => setRoleVoice(role, e.target.value)}
              placeholder={t`alloy`}
            />
            {supportedVoices.length > 0 && (
              <datalist id={voiceListId}>
                {supportedVoices.map((voice) => (
                  <option key={voice} value={voice} />
                ))}
              </datalist>
            )}
          </SettingsField>
        )}
      </div>
    </SettingsPanel>
  );
}

export default function SettingsApi() {
  return (
    <SettingsStack>
      <RoleApiSettings role="narrator" />
      <RoleApiSettings role="utility" />
      <RoleApiSettings role="speechToText" />
      <RoleApiSettings role="textToSpeech" />
    </SettingsStack>
  );
}

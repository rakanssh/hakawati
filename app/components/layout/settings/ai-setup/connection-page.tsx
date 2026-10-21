import { useEffect, useState, type ReactNode } from "react";
import { Trans, useLingui } from "@lingui/react/macro";
import { plural } from "@lingui/core/macro";
import { EyeIcon, EyeOffIcon, KeyRoundIcon, Loader2Icon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { apiPresetMap } from "@/data/api-presets";
import { useConnectionModels } from "@/hooks/useConnectionModels";
import { useLocalServerDiscovery } from "@/hooks/useLocalServerDiscovery";
import { findConnection } from "@/store/model-connections";
import { useSettingsStore } from "@/store/useSettingsStore";
import {
  ApiConnection,
  ApiPreset,
  ApiType,
  MODEL_ROLES,
  type ModelRole,
} from "@/types";
import { useSettingsNavigation } from "../settings-shell";
import { ChatGptConnection, ChatGptUsageLink } from "../chatgpt-connection";
import { ProviderHelpModal } from "../provider-help-modal";
import { useAssignNewConnection } from "./add-connection";
import { pageKey } from "./pages";
import {
  LinkRow,
  PlainRow,
  RoleName,
  SetupList,
  SetupSection,
  StatusBanner,
  keyTail,
  useConnectionNames,
} from "./parts";

function isHttpUrl(value: string) {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

function maskKey(apiKey: string) {
  const key = apiKey.trim();
  const prefix =
    key.length >= 16 ? (key.match(/^[a-z]+(?:-[a-z]+)?-/i)?.[0] ?? "") : "";
  return `${prefix}••••••••${key.length >= 8 ? keyTail(key) : ""}`;
}

function KeyHelpLink({ preset }: { preset: ApiPreset }) {
  const config = apiPresetMap[preset];
  if (!config.help || !config.help.apiKeyUrl) return null;
  return (
    <ProviderHelpModal
      preset={config}
      renderTrigger={(open) => (
        <button
          type="button"
          onClick={open}
          className="self-start px-0.5 text-sm text-primary underline-offset-4 hover:underline"
        >
          <Trans>How to get a key</Trans>
        </button>
      )}
    />
  );
}

function SecretInput({
  id,
  value,
  onChange,
  onEnter,
  placeholder,
}: {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  placeholder?: string;
}) {
  const { t } = useLingui();
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative min-w-0 flex-1">
      <Input
        id={id}
        type={visible ? "text" : "password"}
        value={value}
        autoComplete="off"
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") onEnter?.();
        }}
        placeholder={placeholder}
        aria-label={t`API key`}
        className="h-11 pe-10"
      />
      <button
        type="button"
        onClick={() => setVisible(!visible)}
        className="absolute end-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
        aria-label={visible ? t`Hide API key` : t`Show API key`}
      >
        {visible ? (
          <EyeOffIcon className="size-4" />
        ) : (
          <EyeIcon className="size-4" />
        )}
      </button>
    </div>
  );
}

function AddressInput({
  value,
  onChange,
  onEnter,
  local,
}: {
  value: string;
  onChange: (value: string) => void;
  onEnter?: () => void;
  local?: boolean;
}) {
  const { t } = useLingui();
  return (
    <Input
      value={value}
      inputMode="url"
      autoCapitalize="off"
      autoCorrect="off"
      spellCheck={false}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") onEnter?.();
      }}
      placeholder={
        local ? "http://localhost:11434/v1" : "https://api.example.com/v1"
      }
      aria-label={t`Address`}
      className="h-11 min-w-0 flex-1"
    />
  );
}

function AddressError({ value }: { value: string }) {
  if (!value.trim() || isHttpUrl(value)) return null;
  return (
    <p role="alert" className="px-0.5 text-sm text-destructive">
      <Trans>Enter the full address, starting with http:// or https://</Trans>
    </p>
  );
}

function LocalServers({
  onUse,
}: {
  onUse: (server: { baseUrl: string; label: string }) => void;
}) {
  const { servers, scanning, error, scan } = useLocalServerDiscovery(
    ApiType.OPENAI,
  );

  useEffect(() => {
    void scan();
  }, [scan]);

  return (
    <SetupSection title={<Trans>Found on your network</Trans>}>
      <SetupList>
        {servers.map((server) => (
          <LinkRow
            key={server.baseUrl}
            title={server.label}
            detail={server.baseUrl}
            onClick={() => onUse(server)}
          />
        ))}
        {servers.length === 0 && (
          <PlainRow className="text-sm text-muted-foreground">
            {scanning ? (
              <Trans>Looking for servers…</Trans>
            ) : (
              <Trans>No servers found</Trans>
            )}
          </PlainRow>
        )}
      </SetupList>
      {error && <p className="px-0.5 text-sm text-destructive">{error}</p>}
      <Button
        variant="outline"
        className="self-start"
        disabled={scanning}
        onClick={() => void scan()}
      >
        {scanning ? <Trans>Searching…</Trans> : <Trans>Search again</Trans>}
      </Button>
    </SetupSection>
  );
}

export function NewConnectionPage({
  preset,
  role,
}: {
  preset: ApiPreset;
  role?: ModelRole;
}) {
  const { t } = useLingui();
  const navigation = useSettingsNavigation();
  const addConnection = useSettingsStore((state) => state.addConnection);
  const assign = useAssignNewConnection(role);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const config = apiPresetMap[preset];
  const isLocal = preset === ApiPreset.LOCAL;
  const canSave = config.editableUrl
    ? isHttpUrl(baseUrl)
    : apiKey.trim().length > 0;

  function save(connection: { baseUrl?: string; label?: string } = {}) {
    const id = addConnection({ preset, apiKey, baseUrl, ...connection });
    const assigned = assign(id);
    if (role) {
      // Back past the provider list to the role it was added for.
      navigation.back();
      navigation.back();
    } else {
      // A first connection goes to the narrator, whose page then picks a model.
      navigation.back();
      navigation.replace(
        pageKey(
          assigned
            ? { kind: "role", role: assigned }
            : { kind: "connection", id },
        ),
      );
    }
  }

  function submit() {
    if (canSave) save();
  }

  return (
    <div className="flex flex-col gap-6">
      {isLocal && <LocalServers onUse={(server) => save(server)} />}
      {config.editableUrl && (
        <SetupSection title={<Trans>Address</Trans>}>
          <AddressInput
            value={baseUrl}
            onChange={setBaseUrl}
            onEnter={submit}
            local={isLocal}
          />
          <AddressError value={baseUrl} />
        </SetupSection>
      )}
      <SetupSection title={<Trans>API key</Trans>}>
        <SecretInput
          value={apiKey}
          onChange={setApiKey}
          onEnter={submit}
          placeholder={config.editableUrl ? t`Optional` : undefined}
        />
        <KeyHelpLink preset={preset} />
      </SetupSection>
      <Button
        className="h-11 self-start px-6"
        disabled={!canSave}
        onClick={submit}
      >
        <Trans>Save</Trans>
      </Button>
    </div>
  );
}

function ConnectionStatus({ connection }: { connection: ApiConnection }) {
  const { t } = useLingui();
  const { models, loading, error, refresh } = useConnectionModels(connection);
  const needsKey =
    !apiPresetMap[connection.preset].editableUrl && !connection.apiKey;

  if (needsKey) {
    return (
      <StatusBanner tone="muted" title={<Trans>Add your API key</Trans>} />
    );
  }
  if (loading) {
    return (
      <StatusBanner
        tone="muted"
        title={<Trans>Checking…</Trans>}
        action={<Loader2Icon className="size-4 animate-spin" />}
      />
    );
  }
  if (error) {
    return (
      <StatusBanner
        tone="destructive"
        title={<Trans>Couldn’t connect</Trans>}
        detail={error}
        action={
          <Button variant="outline" size="sm" onClick={() => void refresh()}>
            <Trans>Retry</Trans>
          </Button>
        }
      />
    );
  }
  if (!models) return null;
  return (
    <StatusBanner
      tone="success"
      title={<Trans>Connected</Trans>}
      detail={t`${plural(models.length, {
        one: "# model available",
        other: "# models available",
      })}`}
    />
  );
}

function KeySection({ connection }: { connection: ApiConnection }) {
  const { t } = useLingui();
  const updateConnection = useSettingsStore((state) => state.updateConnection);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const optional = apiPresetMap[connection.preset].editableUrl;

  function save() {
    updateConnection(connection.id, { apiKey: draft });
    setEditing(false);
  }

  return (
    <SetupSection title={<Trans>API key</Trans>}>
      {editing ? (
        <div className="flex flex-wrap gap-2">
          <SecretInput
            value={draft}
            onChange={setDraft}
            onEnter={save}
            placeholder={optional ? t`Optional` : undefined}
          />
          <div className="flex gap-2">
            <Button
              className="h-11"
              disabled={!optional && !draft.trim()}
              onClick={save}
            >
              <Trans>Save</Trans>
            </Button>
            <Button
              variant="outline"
              className="h-11"
              onClick={() => setEditing(false)}
            >
              <Trans>Cancel</Trans>
            </Button>
          </div>
        </div>
      ) : (
        <SetupList>
          <PlainRow className="py-2 pe-2">
            <KeyRoundIcon
              aria-hidden="true"
              className="size-4 shrink-0 text-muted-foreground"
            />
            <span className="min-w-0 flex-1 truncate text-sm tracking-wider">
              {connection.apiKey ? (
                maskKey(connection.apiKey)
              ) : (
                <span className="tracking-normal text-muted-foreground">
                  <Trans>No key</Trans>
                </span>
              )}
            </span>
            <Button
              variant="outline"
              onClick={() => {
                setDraft("");
                setEditing(true);
              }}
            >
              {connection.apiKey ? <Trans>Replace</Trans> : <Trans>Add</Trans>}
            </Button>
          </PlainRow>
        </SetupList>
      )}
      <KeyHelpLink preset={connection.preset} />
    </SetupSection>
  );
}

function AddressSection({ connection }: { connection: ApiConnection }) {
  const updateConnection = useSettingsStore((state) => state.updateConnection);
  const [draft, setDraft] = useState(connection.baseUrl);
  const changed = draft.trim() !== connection.baseUrl;

  useEffect(() => setDraft(connection.baseUrl), [connection.baseUrl]);

  function save() {
    if (changed && isHttpUrl(draft)) {
      updateConnection(connection.id, { baseUrl: draft });
    }
  }

  return (
    <SetupSection title={<Trans>Address</Trans>}>
      <div className="flex gap-2">
        <AddressInput
          value={draft}
          onChange={setDraft}
          onEnter={save}
          local={connection.preset === ApiPreset.LOCAL}
        />
        {changed && (
          <Button className="h-11" disabled={!isHttpUrl(draft)} onClick={save}>
            <Trans>Save</Trans>
          </Button>
        )}
      </div>
      <AddressError value={draft} />
    </SetupSection>
  );
}

function UsedBy({ connection }: { connection: ApiConnection }) {
  const navigation = useSettingsNavigation();
  const modelRoles = useSettingsStore((state) => state.modelRoles);
  const roles = MODEL_ROLES.filter(
    (role) => modelRoles[role].connectionId === connection.id,
  );
  return (
    <SetupSection title={<Trans>Used by</Trans>}>
      <SetupList>
        {roles.map((role) => (
          <LinkRow
            key={role}
            title={<RoleName role={role} />}
            trailing={
              <span className="max-w-[50%] truncate text-[0.8rem] text-muted-foreground">
                {modelRoles[role].model?.name}
              </span>
            }
            onClick={() => navigation.push(pageKey({ kind: "role", role }))}
          />
        ))}
        {roles.length === 0 && (
          <PlainRow className="text-sm text-muted-foreground">
            <Trans>No roles yet</Trans>
          </PlainRow>
        )}
      </SetupList>
    </SetupSection>
  );
}

function RemoveConnection({
  connection,
  name,
}: {
  connection: ApiConnection;
  name: string;
}) {
  const navigation = useSettingsNavigation();
  const removeConnection = useSettingsStore((state) => state.removeConnection);
  const used = useSettingsStore((state) =>
    MODEL_ROLES.some(
      (role) => state.modelRoles[role].connectionId === connection.id,
    ),
  );
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      <Button
        variant="ghost"
        className="self-start px-1 text-destructive hover:text-destructive"
        onClick={() => setConfirming(true)}
      >
        <Trans>Remove connection</Trans>
      </Button>
      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              <Trans>Remove {name}?</Trans>
            </AlertDialogTitle>
            {used && (
              <AlertDialogDescription>
                <Trans>Roles using it will need another connection.</Trans>
              </AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              <Trans>Cancel</Trans>
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-white hover:bg-destructive/90"
              onClick={() => {
                navigation.back();
                removeConnection(connection.id);
              }}
            >
              <Trans>Remove</Trans>
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export function ConnectionPage({ id }: { id: string }) {
  const connection = useSettingsStore((state) =>
    findConnection(state.connections, id),
  );
  const name = useConnectionNames();
  if (!connection) return null;

  let details: ReactNode;
  if (connection.preset === ApiPreset.CHATGPT) {
    details = (
      <SetupSection title={<Trans>Account</Trans>}>
        <div className="rounded-xs border border-border/70 bg-background/60 p-3.5">
          <ChatGptConnection />
        </div>
        <div className="px-0.5 text-muted-foreground">
          <ChatGptUsageLink />
        </div>
      </SetupSection>
    );
  } else {
    details = (
      <>
        <ConnectionStatus connection={connection} />
        {apiPresetMap[connection.preset].editableUrl && (
          <AddressSection connection={connection} />
        )}
        <KeySection connection={connection} />
      </>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {details}
      <UsedBy connection={connection} />
      <RemoveConnection connection={connection} name={name(connection)} />
    </div>
  );
}

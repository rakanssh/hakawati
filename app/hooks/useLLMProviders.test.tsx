import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useSettingsStore } from "@/store/useSettingsStore";
import { ApiPreset } from "@/types";
import type { LLMModel } from "@/services/llm/schema";
import { useLLMProviders } from "./useLLMProviders";

const { getRoleModels, useChatGpt } = vi.hoisted(() => ({
  getRoleModels: vi.fn(),
  useChatGpt: vi.fn(),
}));

vi.mock("@/services/llm", () => ({ getRoleModels }));
vi.mock("@/hooks/useChatGpt", () => ({ useChatGpt }));
vi.mock("@/store/useChatGptStore", () => ({
  useChatGptStore: { getState: () => useChatGpt.getMockImplementation()?.() },
}));
vi.mock("@lingui/core/macro", () => ({
  msg: (value: TemplateStringsArray | string) =>
    typeof value === "string" ? value : value.join(""),
}));

const account = (id: string | null = "account-a", connected = true) => ({
  session: {
    account: id ? { id, email: `${id}@example.com` } : null,
    connected,
    planUsageEnabled: connected,
  },
  busy: null,
  loading: false,
});

function pendingModels() {
  let resolve!: (models: LLMModel[]) => void;
  const promise = new Promise<LLMModel[]>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const model = (id: string): LLMModel => ({ id, name: id });

function renderProviders() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  let state: ReturnType<typeof useLLMProviders> | undefined;
  function Harness() {
    state = useLLMProviders("narrator");
    return null;
  }
  const render = () => act(() => root.render(createElement(Harness)));
  render();
  return {
    get state() {
      if (!state) throw new Error("Provider hook did not render.");
      return state;
    },
    render,
    cleanup() {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("useLLMProviders account and provider transitions", () => {
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.resetAllMocks();
    useChatGpt.mockReturnValue(account());
    useSettingsStore.setState(useSettingsStore.getInitialState());
    useSettingsStore
      .getState()
      .setRoleActivePreset("narrator", ApiPreset.CHATGPT);
    useSettingsStore.getState().clearChatGptModels("account-a");
  });

  afterEach(() => {
    useSettingsStore.setState(useSettingsStore.getInitialState());
  });

  it("waits for ChatGPT plan authorization before loading or selecting a model", async () => {
    useChatGpt.mockReturnValue(account("account-a", false));
    const harness = renderProviders();
    try {
      expect(getRoleModels).not.toHaveBeenCalled();
      expect(harness.state.enabled).toBe(false);
      expect(harness.state.models).toEqual([]);

      getRoleModels.mockResolvedValueOnce([model("plan-model")]);
      useChatGpt.mockReturnValue(account());
      await act(async () => {
        harness.render();
      });
      expect(getRoleModels).toHaveBeenCalledTimes(1);
      expect(harness.state.enabled).toBe(true);
      expect(useSettingsStore.getState().modelRoles.narrator.model?.id).toBe(
        "plan-model",
      );
    } finally {
      harness.cleanup();
    }
  });

  it("ignores the previous provider catalog when switching providers with the same URL", async () => {
    useSettingsStore
      .getState()
      .setRoleActivePreset("narrator", ApiPreset.OPENAI);
    const apiCatalog = pendingModels();
    const planCatalog = pendingModels();
    getRoleModels
      .mockReturnValueOnce(apiCatalog.promise)
      .mockReturnValueOnce(planCatalog.promise);
    const harness = renderProviders();
    try {
      const oldSignal = getRoleModels.mock.calls[0][1] as AbortSignal;
      const apiUrl = useSettingsStore.getState().modelRoles.narrator.baseUrl;
      act(() =>
        useSettingsStore
          .getState()
          .setRoleActivePreset("narrator", ApiPreset.CHATGPT),
      );
      expect(useSettingsStore.getState().modelRoles.narrator.baseUrl).toBe(
        apiUrl,
      );
      expect(oldSignal.aborted).toBe(true);

      await act(async () => {
        planCatalog.resolve([model("plan-model")]);
      });
      await act(async () => {
        apiCatalog.resolve([model("api-model")]);
      });
      expect(harness.state.models).toEqual([model("plan-model")]);
      expect(useSettingsStore.getState().modelRoles.narrator.model?.id).toBe(
        "plan-model",
      );
      expect(getRoleModels).toHaveBeenCalledTimes(2);
    } finally {
      harness.cleanup();
    }
  });

  it("reloads models after reconnecting with another account and ignores a prior account's late response", async () => {
    const firstCatalog = pendingModels();
    const secondCatalog = pendingModels();
    getRoleModels
      .mockReturnValueOnce(firstCatalog.promise)
      .mockReturnValueOnce(secondCatalog.promise);
    const harness = renderProviders();
    try {
      const firstSignal = getRoleModels.mock.calls[0][1] as AbortSignal;
      useChatGpt.mockReturnValue(account(null, false));
      act(() => useSettingsStore.getState().clearChatGptModels());
      expect(firstSignal.aborted).toBe(true);
      useChatGpt.mockReturnValue(account("account-b"));
      act(() => useSettingsStore.getState().clearChatGptModels("account-b"));
      await act(async () => {
        secondCatalog.resolve([model("account-b-model")]);
      });
      await act(async () => {
        firstCatalog.resolve([model("account-a-model")]);
      });
      expect(harness.state.models).toEqual([model("account-b-model")]);
      expect(useSettingsStore.getState().modelRoles.narrator.model?.id).toBe(
        "account-b-model",
      );
    } finally {
      harness.cleanup();
    }
  });

  it("keeps a signed-out account unconfigured when its pending catalog arrives", async () => {
    const catalog = pendingModels();
    getRoleModels.mockReturnValueOnce(catalog.promise);
    const harness = renderProviders();
    try {
      const signal = getRoleModels.mock.calls[0][1] as AbortSignal;
      useChatGpt.mockReturnValue(account(null, false));
      act(() => useSettingsStore.getState().clearChatGptModels());
      await act(async () => {
        catalog.resolve([model("stale-model")]);
      });
      expect(signal.aborted).toBe(true);
      expect(harness.state.enabled).toBe(false);
      expect(harness.state.models).toEqual([]);
      expect(harness.state.loading).toBe(false);
      expect(
        useSettingsStore.getState().modelRoles.narrator.model,
      ).toBeUndefined();
    } finally {
      harness.cleanup();
    }
  });

  it("does not install a stale model during an expired-session render boundary", async () => {
    const previousCatalog = pendingModels();
    getRoleModels.mockReturnValueOnce(previousCatalog.promise);
    const harness = renderProviders();
    try {
      // Expiration retains the account identity for reconnecting.
      useChatGpt.mockReturnValue(account("account-a", false));
      await act(async () => {
        useSettingsStore.getState().clearChatGptModels();
        previousCatalog.resolve([model("account-a-model")]);
        await Promise.resolve();
        expect(
          useSettingsStore.getState().modelRoles.narrator.model,
        ).toBeUndefined();
      });
      expect(harness.state.models).toEqual([]);
      expect(harness.state.enabled).toBe(false);
    } finally {
      harness.cleanup();
    }
  });

  it("rechecks an API-key catalog after the key changes at the same URL", async () => {
    useSettingsStore
      .getState()
      .setRoleActivePreset("narrator", ApiPreset.OPENAI);
    const firstCatalog = pendingModels();
    getRoleModels
      .mockReturnValueOnce(firstCatalog.promise)
      .mockResolvedValueOnce([model("new-key-model")]);
    const harness = renderProviders();
    try {
      const firstSignal = getRoleModels.mock.calls[0][1] as AbortSignal;
      await act(async () => {
        useSettingsStore
          .getState()
          .setRoleApiKey("narrator", "replacement-key");
      });
      await act(async () => {
        firstCatalog.resolve([model("old-key-model")]);
      });
      expect(firstSignal.aborted).toBe(true);
      expect(harness.state.models).toEqual([model("new-key-model")]);
      expect(getRoleModels).toHaveBeenCalledTimes(2);
    } finally {
      harness.cleanup();
    }
  });

  it("does not refetch or clear an error during background account status refreshes", async () => {
    const catalog = pendingModels();
    getRoleModels.mockReturnValueOnce(catalog.promise);
    const harness = renderProviders();
    try {
      const signal = getRoleModels.mock.calls[0][1] as AbortSignal;
      useChatGpt.mockReturnValue({ ...account(), loading: true });
      harness.render();
      expect(signal.aborted).toBe(false);
      useChatGpt.mockReturnValue(account());
      harness.render();
      expect(getRoleModels).toHaveBeenCalledTimes(1);

      await act(async () => {
        catalog.resolve([]);
      });
      getRoleModels.mockRejectedValueOnce(
        new Error("Plan usage is unavailable"),
      );
      await act(async () => {
        harness.state.refresh();
      });
      expect(harness.state.error).toBe("Plan usage is unavailable");
      useChatGpt.mockReturnValue({ ...account(), loading: true });
      harness.render();
      useChatGpt.mockReturnValue(account());
      harness.render();
      expect(getRoleModels).toHaveBeenCalledTimes(2);
      expect(harness.state.error).toBe("Plan usage is unavailable");
    } finally {
      harness.cleanup();
    }
  });
});

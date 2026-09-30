import { beforeEach, describe, expect, it, vi } from "vitest";
import { useChatGptStore } from "./useChatGptStore";
import { createDefaultModelRoles, useSettingsStore } from "./useSettingsStore";
import { ApiPreset } from "@/types";
import type { ChatGptSession } from "@/services/chatgpt";

const { auth, notifySessionChanged } = vi.hoisted(() => {
  let listener = () => {};
  return {
    auth: {
      getChatGptSession: vi.fn(),
      signInWithChatGpt: vi.fn(),
      signOutOfChatGpt: vi.fn(),
      subscribeChatGptSession: vi.fn((next: () => void) => {
        listener = next;
        return () => {};
      }),
    },
    notifySessionChanged: () => listener(),
  };
});
vi.mock("@/services/chatgpt", () => auth);
vi.mock("@lingui/core/macro", () => ({
  msg: (value: TemplateStringsArray) => value.join(""),
}));

const connected = {
  available: true,
  connected: true,
  planUsageEnabled: true,
  account: { id: "account-a", email: "a@example.com" },
};
const selectedModel = { id: "selected-model", name: "Selected Model" };
const secondAccount: ChatGptSession = {
  ...connected,
  account: { id: "account-b", email: "b@example.com" },
};

function pendingSession() {
  let resolve!: (session: ChatGptSession) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<ChatGptSession>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  vi.clearAllMocks();
  const modelRoles = createDefaultModelRoles();
  modelRoles.narrator.activePreset = ApiPreset.CHATGPT;
  modelRoles.narrator.model = selectedModel;
  modelRoles.narrator.profiles[ApiPreset.CHATGPT].model = selectedModel;
  useSettingsStore.setState({
    modelRoles,
    chatGptProfileId: "account-a",
    chatGptPlanNoticeAcknowledged: false,
  });
  useChatGptStore.setState({
    session: null,
    loading: false,
    busy: null,
    error: null,
    showPlanNotice: false,
    revocationUnconfirmed: false,
  });
  auth.getChatGptSession.mockReset().mockResolvedValue(connected);
  auth.signInWithChatGpt.mockReset().mockResolvedValue(connected);
  auth.signOutOfChatGpt
    .mockReset()
    .mockResolvedValue({ remoteRevocationConfirmed: true });
});

describe("ChatGPT connection state", () => {
  it("preserves the selected model after reopening the app with the same account", async () => {
    await useChatGptStore.getState().load();
    expect(useSettingsStore.getState().modelRoles.narrator.model).toEqual(
      selectedModel,
    );
  });

  it("clears account-scoped models when disconnecting and reconnecting with another account", async () => {
    await useChatGptStore.getState().load();
    await useChatGptStore.getState().signOut();
    expect(useChatGptStore.getState().session?.account).toBeNull();
    auth.signInWithChatGpt.mockResolvedValueOnce(secondAccount);
    await useChatGptStore.getState().signIn();
    expect(auth.signInWithChatGpt).toHaveBeenCalledWith({
      signal: expect.any(AbortSignal),
    });
    expect(
      useSettingsStore.getState().modelRoles.narrator.model,
    ).toBeUndefined();
    expect(useSettingsStore.getState().chatGptProfileId).toBe("account-b");
  });

  it("explains plan use once and preserves the acknowledgement", async () => {
    await useChatGptStore.getState().signIn();
    expect(useChatGptStore.getState().showPlanNotice).toBe(true);
    useChatGptStore.getState().dismissPlanNotice();
    await useChatGptStore.getState().signIn();
    expect(useChatGptStore.getState().showPlanNotice).toBe(false);
    expect(useSettingsStore.getState().chatGptPlanNoticeAcknowledged).toBe(
      true,
    );
  });

  it("cancels sign-in without replacing the active account or showing an error", async () => {
    await useChatGptStore.getState().load();
    auth.signInWithChatGpt.mockImplementationOnce(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((_, reject) => {
          signal.addEventListener("abort", () =>
            reject(new DOMException("Cancelled", "AbortError")),
          );
        }),
    );
    const pending = useChatGptStore.getState().signIn();
    useChatGptStore.getState().cancelSignIn();
    await pending;
    expect(useChatGptStore.getState()).toMatchObject({
      busy: null,
      error: null,
      session: connected,
    });
    expect(useSettingsStore.getState().modelRoles.narrator.model).toEqual(
      selectedModel,
    );
  });

  it("clears model readiness on sign-out and reports unconfirmed remote revocation", async () => {
    await useChatGptStore.getState().load();
    auth.signOutOfChatGpt.mockResolvedValue({
      remoteRevocationConfirmed: false,
    });
    auth.getChatGptSession.mockRejectedValue(
      new Error("Keyring temporarily unavailable"),
    );
    await useChatGptStore.getState().signOut();
    expect(
      useSettingsStore.getState().modelRoles.narrator.model,
    ).toBeUndefined();
    expect(useChatGptStore.getState().revocationUnconfirmed).toBe(true);
    expect(useSettingsStore.getState().chatGptProfileId).toBeNull();
    expect(useChatGptStore.getState().session).toMatchObject({
      connected: false,
      planUsageEnabled: false,
      account: null,
    });
  });

  it("uses the committed account from sign-in even when its background metadata read fails", async () => {
    await useChatGptStore.getState().load();
    await useChatGptStore.getState().signOut();
    const metadata = pendingSession();
    auth.getChatGptSession.mockReturnValueOnce(metadata.promise);
    auth.signInWithChatGpt.mockImplementationOnce(async () => {
      notifySessionChanged();
      return secondAccount;
    });
    await useChatGptStore.getState().signIn();
    expect(useChatGptStore.getState()).toMatchObject({
      session: secondAccount,
      busy: null,
      loading: false,
      error: null,
    });
    metadata.reject(new Error("Keyring temporarily unavailable"));
    await Promise.resolve();
    expect(useChatGptStore.getState()).toMatchObject({
      session: secondAccount,
      loading: false,
      error: null,
    });
    expect(useSettingsStore.getState().chatGptProfileId).toBe("account-b");
    expect(
      useSettingsStore.getState().modelRoles.narrator.model,
    ).toBeUndefined();
  });

  it("ignores an old connected snapshot after sign-out succeeds", async () => {
    await useChatGptStore.getState().load();
    const metadata = pendingSession();
    auth.getChatGptSession.mockReturnValueOnce(metadata.promise);
    auth.signOutOfChatGpt.mockImplementationOnce(async () => {
      notifySessionChanged();
      return { remoteRevocationConfirmed: true };
    });
    await useChatGptStore.getState().signOut();
    metadata.resolve(connected);
    await Promise.resolve();
    expect(useChatGptStore.getState()).toMatchObject({
      session: { connected: false, planUsageEnabled: false },
      loading: false,
      error: null,
    });
    expect(
      useSettingsStore.getState().modelRoles.narrator.model,
    ).toBeUndefined();
  });

  it.each(["signIn", "signOut"] as const)(
    "keeps a failed %s error when its session notification finishes afterward",
    async (action) => {
      await useChatGptStore.getState().load();
      const metadata = pendingSession();
      auth.getChatGptSession.mockReturnValueOnce(metadata.promise);
      const mutation =
        action === "signIn" ? auth.signInWithChatGpt : auth.signOutOfChatGpt;
      mutation.mockImplementationOnce(async () => {
        notifySessionChanged();
        throw new Error("Account operation failed");
      });
      await useChatGptStore.getState()[action]();
      expect(useChatGptStore.getState().error).toBe("Account operation failed");
      metadata.resolve(connected);
      await Promise.resolve();
      expect(useChatGptStore.getState()).toMatchObject({
        session: connected,
        loading: false,
        error: "Account operation failed",
      });
      await useChatGptStore.getState().load();
      expect(useChatGptStore.getState().error).toBeNull();
    },
  );

  it("invalidates metadata reads when an account mutation begins", async () => {
    await useChatGptStore.getState().load();
    const metadata = pendingSession();
    const signIn = pendingSession();
    auth.getChatGptSession.mockReturnValueOnce(metadata.promise);
    auth.signInWithChatGpt.mockReturnValueOnce(signIn.promise);
    const staleRead = useChatGptStore.getState().load();
    const operation = useChatGptStore.getState().signIn();
    metadata.resolve({
      ...connected,
      connected: false,
      planUsageEnabled: false,
    });
    await staleRead;
    expect(useChatGptStore.getState()).toMatchObject({
      session: connected,
      busy: "signIn",
      loading: false,
    });
    signIn.resolve(secondAccount);
    await operation;
    expect(useChatGptStore.getState().session).toEqual(secondAccount);
  });
});

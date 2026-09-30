import { act, type ReactNode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ChatGptConnection,
  ChatGptPlanNotice,
  ChatGptUsageLink,
} from "./chatgpt-connection";
import { useChatGptStore } from "@/store/useChatGptStore";
import {
  createDefaultModelRoles,
  useSettingsStore,
} from "@/store/useSettingsStore";

const auth = vi.hoisted(() => ({
  getChatGptSession: vi.fn(),
  signInWithChatGpt: vi.fn(),
  signOutOfChatGpt: vi.fn(),
  subscribeChatGptSession: vi.fn(() => () => {}),
}));
const opener = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("@/services/chatgpt", () => auth);
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: opener }));
vi.mock("@lingui/core/macro", () => ({
  msg: (value: TemplateStringsArray) => value.join(""),
}));
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: ReactNode }) => children,
}));

const disconnected = {
  available: true,
  connected: false,
  planUsageEnabled: false,
  account: null,
};
const connected = {
  available: true,
  connected: true,
  planUsageEnabled: true,
  account: { id: "account-a", email: "player@example.com" },
};
let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  useSettingsStore.setState({
    modelRoles: createDefaultModelRoles(),
    chatGptProfileId: null,
    chatGptPlanNoticeAcknowledged: false,
  });
  useChatGptStore.setState({
    session: null,
    loading: false,
    busy: null,
    error: null,
    revocationUnconfirmed: false,
    showPlanNotice: false,
  });
  auth.getChatGptSession.mockResolvedValue(disconnected);
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render() {
  await act(async () =>
    root.render(
      <>
        <ChatGptConnection />
        <ChatGptPlanNotice />
      </>,
    ),
  );
}
function button(text: string) {
  const found = Array.from(document.querySelectorAll("button")).find(
    (element) => element.textContent?.trim() === text,
  );
  if (!found) throw new Error(`Missing button: ${text}`);
  return found;
}

describe("ChatGPT connection settings", () => {
  it("connects through the single sign-in action, confirms plan usage, then shows the account and Disconnect", async () => {
    await render();
    expect(container.textContent).toBe("Continue with ChatGPT");
    expect(container.querySelector("input[type=password]")).toBeNull();
    auth.signInWithChatGpt.mockImplementationOnce(async () => {
      auth.getChatGptSession.mockResolvedValue(connected);
      return connected;
    });
    await act(async () => button("Continue with ChatGPT").click());
    expect(auth.signInWithChatGpt).toHaveBeenCalledWith({
      signal: expect.any(AbortSignal),
    });
    expect(container.textContent).toBe("player@example.comDisconnect");
    expect(container.querySelector('[role="combobox"]')).toBeNull();
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog?.textContent).toContain(
      "You’re now using your ChatGPT plan!",
    );
    expect(dialog?.textContent).toContain(
      "Hakawati will now consume resources from your ChatGPT plan when you have the ChatGPT subscription provider selected.",
    );
    expect(dialog?.textContent).not.toContain("Manage usage");
    await act(async () => button("Got it").click());
    expect(useSettingsStore.getState().chatGptPlanNoticeAcknowledged).toBe(
      true,
    );
    expect(button("Disconnect")).toBeDefined();
  });

  it("returns to the single sign-in action after disconnecting", async () => {
    auth.getChatGptSession.mockResolvedValueOnce(connected);
    auth.signOutOfChatGpt.mockResolvedValueOnce({
      remoteRevocationConfirmed: true,
    });
    await render();
    expect(container.textContent).toBe("player@example.comDisconnect");
    await act(async () => button("Disconnect").click());
    expect(auth.signOutOfChatGpt).toHaveBeenCalledOnce();
    expect(useChatGptStore.getState().session?.account).toBeNull();
    expect(container.textContent).toBe("Continue with ChatGPT");
  });

  it("lets an expired account reconnect or disconnect to use another account", async () => {
    auth.getChatGptSession.mockResolvedValueOnce({
      ...connected,
      connected: false,
      planUsageEnabled: false,
    });
    auth.signOutOfChatGpt.mockResolvedValueOnce({
      remoteRevocationConfirmed: true,
    });
    await render();
    expect(container.textContent).toContain("player@example.com");
    expect(button("Continue with ChatGPT")).toBeDefined();
    await act(async () => button("Disconnect").click());
    expect(useChatGptStore.getState().session?.account).toBeNull();
    expect(container.textContent).toBe("Continue with ChatGPT");
  });

  it("offers cancellation while waiting for browser authorization", async () => {
    auth.signInWithChatGpt.mockImplementationOnce(
      ({ signal }: { signal: AbortSignal }) =>
        new Promise((_, reject) => {
          signal.addEventListener("abort", () =>
            reject(new DOMException("Cancelled", "AbortError")),
          );
        }),
    );
    await render();
    await act(async () => button("Continue with ChatGPT").click());
    expect(container.textContent).toContain(
      "Finish signing in in your browser",
    );
    await act(async () => button("Cancel").click());
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(button("Continue with ChatGPT")).toBeDefined();
  });

  it("lets a signed-in account enable previously declined plan usage", async () => {
    auth.getChatGptSession.mockResolvedValue({
      ...connected,
      planUsageEnabled: false,
    });
    await render();
    expect(container.textContent).toContain(
      "ChatGPT plan usage is not enabled",
    );
    expect(button("Continue with ChatGPT")).toBeDefined();
    expect(document.querySelector('[role="dialog"]')).toBeNull();
    auth.signInWithChatGpt.mockResolvedValueOnce(connected);
    await act(async () => button("Continue with ChatGPT").click());
    expect(container.querySelector('[role="alert"]')).toBeNull();
    expect(container.textContent).toBe("player@example.comDisconnect");
    expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  });

  it("gives browser/mobile users a desktop explanation instead of a broken sign-in button", async () => {
    auth.getChatGptSession.mockResolvedValue({
      ...disconnected,
      available: false,
    });
    await render();
    expect(container.textContent).toContain(
      "desktop app on Windows, macOS, and Linux",
    );
    expect(
      Array.from(container.querySelectorAll("button")).some(
        (element) => element.textContent === "Continue with ChatGPT",
      ),
    ).toBe(false);
    expect(auth.signInWithChatGpt).not.toHaveBeenCalled();
  });

  it("opens the official usage settings and surfaces browser launch failures", async () => {
    await act(async () => root.render(<ChatGptUsageLink />));
    opener.mockRejectedValueOnce(new Error("No browser"));
    await act(async () => button("Manage usage").click());
    expect(opener).toHaveBeenCalledWith("https://chatgpt.com/settings/usage");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      "Could not open your browser",
    );
  });
});

import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerAnnouncement } from "@/lib/server-announcement";
import { ServerAnnouncementCard } from "./server-announcement";

const mocks = vi.hoisted(() => ({
  locale: "en",
  openUrl: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@lingui/react/macro", () => ({
  Trans: ({ children }: { children: unknown }) => children,
  useLingui: () => ({
    i18n: { locale: mocks.locale },
    t: (parts: TemplateStringsArray, ...values: unknown[]) =>
      parts.reduce(
        (text, part, index) => `${text}${part}${values[index] ?? ""}`,
        "",
      ),
  }),
}));
vi.mock("@tauri-apps/plugin-opener", () => ({ openUrl: mocks.openUrl }));
vi.mock("sonner", () => ({ toast: { error: mocks.error } }));

const notice: ServerAnnouncement = {
  id: "491c7ee0-a094-408a-84c9-7f3ee24b519a",
  en: {
    title: "A small update",
    body: "<script>no HTML</script>\nJust a quiet notice.",
  },
  ar: { title: "تحديث صغير", body: "أهلاً بكم" },
  expiresAt: "2030-01-01T00:01:00.000Z",
};

describe("Home server announcement", () => {
  let root: Root;
  let container: HTMLDivElement;
  beforeEach(() => {
    (
      globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    vi.setSystemTime("2030-01-01T00:00:00.000Z");
    vi.clearAllMocks();
    localStorage.clear();
    mocks.locale = "en";
    mocks.openUrl.mockResolvedValue(undefined);
    container = document.createElement("div");
    document.body.append(container);
    root = createRoot(container);
  });
  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  function render(
    announcement: ServerAnnouncement | null = notice,
    baseUrl = "https://cloud.example",
  ) {
    act(() =>
      root.render(
        createElement(ServerAnnouncementCard, { announcement, baseUrl }),
      ),
    );
  }
  function dismiss() {
    act(() =>
      container
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Dismiss announcement"]',
        )!
        .click(),
    );
  }

  it("shows a quiet region with plain text and no link unless supplied", () => {
    render();
    expect(
      container.querySelector('section[aria-label="From Hakawati"]'),
    ).not.toBeNull();
    expect(container.querySelector("h2")?.textContent).toBe(notice.en.title);
    expect(container.textContent).toContain(notice.en.body);
    expect(
      container.querySelector("script, a, [role=alert], [role=dialog]"),
    ).toBeNull();
  });

  it("stays dismissed on remount, but new announcements and other servers appear", () => {
    render();
    dismiss();
    expect(container.textContent).toBe("");
    act(() => root.unmount());
    root = createRoot(container);
    render();
    expect(container.textContent).toBe("");
    render({ ...notice, id: "891c7ee0-a094-408a-84c9-7f3ee24b519a" });
    expect(container.querySelector("h2")).not.toBeNull();
    render(notice, "https://other.example");
    expect(container.querySelector("h2")).not.toBeNull();
  });

  it("can dismiss even if local storage cannot be written", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("disabled");
    });
    render();
    dismiss();
    expect(container.textContent).toBe("");
  });

  it("disappears at expiry while Home remains open and hides missing or expired notices", () => {
    render(null);
    expect(container.textContent).toBe("");
    render();
    act(() => vi.advanceTimersByTime(60_000));
    expect(container.textContent).toBe("");
    render();
    expect(container.textContent).toBe("");
  });

  it("handles expiry beyond the browser timeout limit without an immediate timeout loop", () => {
    const farFuture = { ...notice, expiresAt: "2030-02-01T00:00:00Z" };
    render(farFuture);
    act(() => vi.advanceTimersByTime(2_147_483_647));
    expect(container.querySelector("h2")).not.toBeNull();
    act(() =>
      vi.advanceTimersByTime(Date.parse(farFuture.expiresAt) - Date.now()),
    );
    expect(container.textContent).toBe("");
  });

  it("uses Arabic and falls back to readable English when Arabic is missing", () => {
    mocks.locale = "ar-SA";
    render();
    expect(
      container.querySelector('[lang="ar"][dir="rtl"]')?.textContent,
    ).toContain(notice.ar!.title);
    render({ ...notice, ar: undefined });
    expect(
      container.querySelector('[lang="en"][dir="ltr"]')?.textContent,
    ).toContain(notice.en.title);
  });

  it("opens the optional link only after a click and reports opener errors", async () => {
    render({ ...notice, url: "https://hakawati.dev/news" });
    expect(container.querySelector("a")?.textContent).toBe("Learn more");
    expect(mocks.openUrl).not.toHaveBeenCalled();
    mocks.openUrl.mockRejectedValueOnce(new Error("opener failed"));
    await act(async () =>
      container.querySelector<HTMLAnchorElement>("a")!.click(),
    );
    expect(mocks.openUrl).toHaveBeenCalledExactlyOnceWith(
      "https://hakawati.dev/news",
    );
    expect(mocks.error).toHaveBeenCalledExactlyOnceWith(
      "Could not open the link",
    );
  });

  it("uses the supplied link label as plain text and only when a URL is present", () => {
    const linkLabel = "Read <b>the news</b>";
    render({ ...notice, linkLabel });
    expect(container.querySelector("a")).toBeNull();
    render({ ...notice, url: "https://hakawati.dev/news", linkLabel });
    expect(container.querySelector("a")?.textContent).toBe(linkLabel);
    expect(container.querySelector("a b")).toBeNull();
  });
});

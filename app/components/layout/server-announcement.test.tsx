import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ServerAnnouncement } from "@/lib/server-announcement";
import { ServerAnnouncementBanner } from "./server-announcement";

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
  kind: "info",
  en: {
    title: "A small update",
    body: "<script>no HTML</script>\nJust a quiet notice.",
  },
  ar: { title: "تحديث صغير", body: "أهلاً بكم" },
  dismissible: true,
  expiresAt: "2030-01-01T00:01:00.000Z",
};
const next: ServerAnnouncement = {
  ...notice,
  id: "891c7ee0-a094-408a-84c9-7f3ee24b519a",
  en: { title: "Next notice", body: "After the first." },
  expiresAt: "2030-01-01T00:02:00.000Z",
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
    announcements: ServerAnnouncement[] | null = [notice],
    baseUrl = "https://cloud.example",
  ) {
    act(() =>
      root.render(
        createElement(ServerAnnouncementBanner, { announcements, baseUrl }),
      ),
    );
  }
  const banner = () =>
    container.querySelector<HTMLElement>('section[aria-label="From Hakawati"]');
  const title = () => banner()?.querySelector("strong")?.textContent;
  const dismissButton = () =>
    container.querySelector<HTMLButtonElement>(
      'button[aria-label="Dismiss announcement"]',
    );
  function dismiss() {
    act(() => dismissButton()!.click());
  }

  it("shows one plain-text notice with its kind and no link unless supplied", () => {
    render([notice, next]);
    expect(banner()?.dataset.announcementKind).toBe("info");
    expect(title()).toBe(notice.en.title);
    expect(banner()?.textContent).toContain(notice.en.body);
    expect(banner()?.textContent).not.toContain(next.en.title);
    expect(
      container.querySelector("script, a, [role=alert], [role=dialog]"),
    ).toBeNull();
  });

  it("marks warnings and outages, and offers no dismissal when the server forbids it", () => {
    render([{ ...notice, kind: "warning" }]);
    expect(banner()?.dataset.announcementKind).toBe("warning");
    expect(dismissButton()).not.toBeNull();
    render([{ ...notice, kind: "outage", dismissible: false }]);
    expect(banner()?.dataset.announcementKind).toBe("outage");
    expect(dismissButton()).toBeNull();
  });

  it("shows the next notice after a dismissal, and keeps dismissals on remount", () => {
    render([notice, next]);
    dismiss();
    expect(title()).toBe(next.en.title);
    act(() => root.unmount());
    root = createRoot(container);
    render([notice, next]);
    expect(title()).toBe(next.en.title);
    dismiss();
    expect(container.textContent).toBe("");
    render([notice], "https://other.example");
    expect(title()).toBe(notice.en.title);
  });

  it("shows a notice that can no longer be dismissed even if it was dismissed before", () => {
    render();
    dismiss();
    expect(container.textContent).toBe("");
    render([{ ...notice, dismissible: false }]);
    expect(title()).toBe(notice.en.title);
  });

  it("can dismiss even if local storage cannot be written", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("disabled");
    });
    render();
    dismiss();
    expect(container.textContent).toBe("");
  });

  it("moves on at expiry while Home stays open, and hides missing or expired notices", () => {
    render(null);
    expect(container.textContent).toBe("");
    render([], "");
    expect(container.textContent).toBe("");
    render([notice, next]);
    act(() => vi.advanceTimersByTime(60_000));
    expect(title()).toBe(next.en.title);
    act(() => vi.advanceTimersByTime(60_000));
    expect(container.textContent).toBe("");
    render([notice, next]);
    expect(container.textContent).toBe("");
  });

  it("handles expiry beyond the browser timeout limit without an immediate timeout loop", () => {
    const farFuture = { ...notice, expiresAt: "2030-02-01T00:00:00Z" };
    render([farFuture]);
    act(() => vi.advanceTimersByTime(2_147_483_647));
    expect(title()).toBe(notice.en.title);
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
    render([{ ...notice, ar: undefined }]);
    expect(
      container.querySelector('[lang="en"][dir="ltr"]')?.textContent,
    ).toContain(notice.en.title);
  });

  it("opens links in the text and the action link only after a click, and reports opener errors", async () => {
    render([
      {
        ...notice,
        en: {
          title: "Update",
          body: "Read [the news](https://hakawati.dev/news) today.",
        },
        url: "https://hakawati.dev/download",
      },
    ]);
    const links = [...container.querySelectorAll("a")];
    expect(links.map((link) => [link.textContent, link.href])).toEqual([
      ["the news", "https://hakawati.dev/news"],
      ["Learn more", "https://hakawati.dev/download"],
    ]);
    expect(banner()?.textContent).toContain("Read the news today.");
    expect(mocks.openUrl).not.toHaveBeenCalled();
    await act(async () => links[0].click());
    expect(mocks.openUrl).toHaveBeenCalledWith("https://hakawati.dev/news");
    mocks.openUrl.mockRejectedValueOnce(new Error("opener failed"));
    await act(async () => links[1].click());
    expect(mocks.openUrl).toHaveBeenLastCalledWith(
      "https://hakawati.dev/download",
    );
    expect(mocks.error).toHaveBeenCalledExactlyOnceWith(
      "Could not open the link",
    );
  });

  it("uses each language's link label as plain text, and only with a URL", () => {
    const linkLabel = "Read <b>the news</b>";
    render([{ ...notice, en: { ...notice.en, linkLabel } }]);
    expect(container.querySelector("a")).toBeNull();
    render([
      {
        ...notice,
        en: { ...notice.en, linkLabel },
        ar: { ...notice.ar!, linkLabel: "اقرأ الأخبار" },
        url: "https://hakawati.dev/news",
      },
    ]);
    expect(container.querySelector("a")?.textContent).toBe(linkLabel);
    expect(container.querySelector("a b")).toBeNull();
    mocks.locale = "ar";
    render([
      {
        ...notice,
        ar: { ...notice.ar!, linkLabel: "اقرأ الأخبار" },
        url: "https://hakawati.dev/news",
      },
    ]);
    expect(container.querySelector("a")?.textContent).toBe("اقرأ الأخبار");
  });
});

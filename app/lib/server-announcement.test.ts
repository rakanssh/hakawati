import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  announcementBodyParts,
  announcementServerKey,
  announcementText,
  dismissAnnouncement,
  isAnnouncementDismissed,
  parseServerAnnouncements,
} from "./server-announcement";

const notice = {
  id: "491c7ee0-a094-408a-84c9-7f3ee24b519a",
  kind: "info",
  en: { title: "A small update", body: "More stories are on the way." },
  dismissible: true,
  expiresAt: "2030-01-01T00:00:00.000Z",
};

function parseOne(value: unknown) {
  return parseServerAnnouncements({ announcements: [value] })[0] ?? null;
}

describe("server announcement contract", () => {
  it("accepts kinds, bilingual text with links, an action link, and dismissal", () => {
    const value = {
      ...notice,
      kind: "outage",
      en: {
        title: "Sync is down",
        body: "Tales stay on this device. [Status](https://status.hakawati.dev)",
        linkLabel: "Status page",
      },
      ar: { title: "المزامنة متوقفة", body: "حكاياتك محفوظة." },
      url: "https://hakawati.dev/news",
      dismissible: false,
    };
    expect(parseOne(value)).toEqual(value);
    expect(parseOne(notice)).toEqual(notice);
  });

  it("reads missing or unknown kinds as news and missing dismissal as allowed", () => {
    const bare = { id: notice.id, en: notice.en, expiresAt: notice.expiresAt };
    expect(parseOne(bare)).toEqual(notice);
    expect(parseOne({ ...notice, kind: "maintenance" })?.kind).toBe("info");
  });

  it("trims text and link labels", () => {
    expect(
      parseOne({
        ...notice,
        en: { title: " Hi ", body: " Text ", linkLabel: "  Read the news  " },
      })?.en,
    ).toEqual({ title: "Hi", body: "Text", linkLabel: "Read the news" });
  });

  it("limits the visible body, not the link addresses inside it", () => {
    const link = `[news](https://hakawati.dev/${"x".repeat(1900)})`;
    expect(
      parseOne({
        ...notice,
        en: { title: "Hi", body: `${"x".repeat(590)} ${link}` },
      }),
    ).not.toBeNull();
    expect(
      parseOne({ ...notice, en: { title: "Hi", body: "x".repeat(601) } }),
    ).toBeNull();
  });

  it.each([
    null,
    undefined,
    [],
    {},
    { ...notice, id: "not-a-uuid" },
    { ...notice, en: undefined },
    { ...notice, en: { title: "", body: "text" } },
    { ...notice, en: { title: "x".repeat(121), body: "text" } },
    { ...notice, en: { title: "title", body: " " } },
    { ...notice, en: { title: "title", body: "x".repeat(4001) } },
    { ...notice, en: { title: "title", body: "text", linkLabel: "" } },
    {
      ...notice,
      en: { title: "title", body: "text", linkLabel: "x".repeat(81) },
    },
    { ...notice, en: { title: "title", body: "text", linkLabel: 3 } },
    { ...notice, ar: { title: "title" } },
    { ...notice, expiresAt: undefined },
    { ...notice, expiresAt: "2030-01-01" },
    { ...notice, expiresAt: "2030-13-01T00:00:00Z" },
    { ...notice, expiresAt: "2030-01-01T00:00:00" },
    { ...notice, url: "javascript:alert(1)" },
    { ...notice, url: "http://hakawati.dev/news" },
    { ...notice, url: "https://name:password@hakawati.dev/news" },
    { ...notice, url: 3 },
  ])("ignores a malformed notice %#", (value) => {
    expect(parseOne(value)).toBeNull();
  });

  it("keeps valid notices beside invalid ones, once each, in the server's order", () => {
    const second = { ...notice, id: "891c7ee0-a094-408a-84c9-7f3ee24b519a" };
    expect(
      parseServerAnnouncements({
        announcements: [{ id: "bad" }, second, notice, second],
      }).map((announcement) => announcement.id),
    ).toEqual([second.id, notice.id]);
  });

  it("reads the single notice of servers without a list, with its shared link label", () => {
    const legacy = {
      id: notice.id,
      en: { title: "Update", body: "Hello" },
      ar: { title: "تحديث", body: "أهلاً" },
      url: "https://hakawati.dev/news",
      linkLabel: " Read the news ",
      expiresAt: notice.expiresAt,
    };
    expect(parseServerAnnouncements({ announcement: legacy })).toEqual([
      {
        id: notice.id,
        kind: "info",
        en: { ...legacy.en, linkLabel: "Read the news" },
        ar: { ...legacy.ar, linkLabel: "Read the news" },
        url: legacy.url,
        dismissible: true,
        expiresAt: notice.expiresAt,
      },
    ]);
    expect(
      parseServerAnnouncements({ announcement: { ...legacy, linkLabel: " " } }),
    ).toEqual([]);
    expect(parseServerAnnouncements({ announcement: null })).toEqual([]);
    expect(
      parseServerAnnouncements({ announcements: [], announcement: legacy }),
    ).toEqual([]);
  });

  it("uses Arabic when provided and falls back to English with its text direction", () => {
    const bilingual = {
      ...notice,
      ar: { title: "تحديث", body: "أهلاً بكم", linkLabel: "اقرأ" },
    } as const;
    const parsed = parseOne(bilingual)!;
    expect(announcementText(parsed, "ar-SA")).toEqual({
      ...bilingual.ar,
      lang: "ar",
      dir: "rtl",
    });
    expect(announcementText(parsed, "en")).toEqual({
      ...notice.en,
      lang: "en",
      dir: "ltr",
    });
    expect(announcementText(parseOne(notice)!, "ar")).toEqual({
      ...notice.en,
      lang: "en",
      dir: "ltr",
    });
  });
});

describe("announcement body links", () => {
  it("splits text around safe HTTPS links", () => {
    expect(
      announcementBodyParts(
        "See [the news](https://hakawati.dev/news) and [status](https://status.hakawati.dev).",
      ),
    ).toEqual([
      { text: "See " },
      { text: "the news", url: "https://hakawati.dev/news" },
      { text: " and " },
      { text: "status", url: "https://status.hakawati.dev" },
      { text: "." },
    ]);
    expect(announcementBodyParts("No links here.")).toEqual([
      { text: "No links here." },
    ]);
  });

  it.each([
    "[insecure](http://hakawati.dev)",
    "[script](javascript:alert(1))",
    "[login](https://name:secret@hakawati.dev)",
    "[spaced](https://hakawati.dev/a b)",
    "[nested [label]](https://hakawati.dev)",
    `[${"x".repeat(81)}](https://hakawati.dev)`,
  ])("keeps anything that isn't a safe link as text: %s", (body) => {
    const parts = announcementBodyParts(body);
    expect(parts.some((part) => part.url)).toBe(false);
    expect(parts.map((part) => part.text).join("")).toBe(body);
  });
});

describe("local announcement dismissal", () => {
  beforeEach(() => localStorage.clear());

  it("persists dismissal for an announcement only on its normalized server", () => {
    dismissAnnouncement(" https://CLOUD.example:443/v1/ ", notice.id);
    expect(announcementServerKey("https://cloud.example/")).toBe(
      "https://cloud.example",
    );
    expect(isAnnouncementDismissed("https://cloud.example", notice.id)).toBe(
      true,
    );
    expect(isAnnouncementDismissed("https://other.example", notice.id)).toBe(
      false,
    );
    expect(
      isAnnouncementDismissed(
        "https://cloud.example",
        "891c7ee0-a094-408a-84c9-7f3ee24b519a",
      ),
    ).toBe(false);
  });

  it("keeps a bounded dismissal history, including after repeated dismissal", () => {
    for (let i = 0; i < 40; i++)
      dismissAnnouncement(`https://server-${i}.example`, notice.id);
    dismissAnnouncement("https://server-39.example", notice.id);
    expect(isAnnouncementDismissed("https://server-0.example", notice.id)).toBe(
      false,
    );
    expect(
      isAnnouncementDismissed("https://server-39.example", notice.id),
    ).toBe(true);
    expect(
      JSON.parse(localStorage.getItem("hakawati.announcement-dismissals")!)
        .length,
    ).toBe(32);
  });

  it("handles corrupt or unavailable local storage without breaking Home", () => {
    localStorage.setItem("hakawati.announcement-dismissals", "not json");
    expect(isAnnouncementDismissed("https://cloud.example", notice.id)).toBe(
      false,
    );
    const write = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("unavailable");
      });
    expect(() =>
      dismissAnnouncement("https://cloud.example", notice.id),
    ).not.toThrow();
    write.mockRestore();
  });
});

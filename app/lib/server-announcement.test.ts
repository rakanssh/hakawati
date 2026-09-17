import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  announcementServerKey,
  announcementText,
  dismissAnnouncement,
  isAnnouncementDismissed,
  parseServerAnnouncement,
} from "./server-announcement";

const notice = {
  id: "491c7ee0-a094-408a-84c9-7f3ee24b519a",
  en: { title: "A small update", body: "More stories are on the way." },
  expiresAt: "2030-01-01T00:00:00.000Z",
};

describe("server announcement contract", () => {
  it("accepts plain text with optional Arabic and an HTTPS link", () => {
    const value = {
      ...notice,
      ar: { title: "تحديث", body: "أهلاً بكم" },
      url: "https://hakawati.dev/news",
      linkLabel: "Read the news",
    };
    expect(parseServerAnnouncement(value)).toEqual(value);
    expect(parseServerAnnouncement(notice)).toEqual(notice);
  });

  it("trims a custom link label", () => {
    expect(
      parseServerAnnouncement({ ...notice, linkLabel: "  Read the news  " })
        ?.linkLabel,
    ).toBe("Read the news");
  });

  it.each([
    null,
    undefined,
    [],
    {},
    { ...notice, id: "not-a-uuid" },
    { ...notice, en: { title: "", body: "text" } },
    { ...notice, en: { title: "x".repeat(121), body: "text" } },
    { ...notice, en: { title: "title", body: "x".repeat(601) } },
    { ...notice, ar: { title: "title" } },
    { ...notice, expiresAt: undefined },
    { ...notice, expiresAt: "2030-01-01" },
    { ...notice, expiresAt: "2030-13-01T00:00:00Z" },
    { ...notice, expiresAt: "2030-01-01T00:00:00" },
    { ...notice, url: "javascript:alert(1)" },
    { ...notice, url: "http://hakawati.dev/news" },
    { ...notice, url: "https://name:password@hakawati.dev/news" },
    { ...notice, url: 3 },
    { ...notice, linkLabel: "" },
    { ...notice, linkLabel: "   " },
    { ...notice, linkLabel: "x".repeat(81) },
    { ...notice, linkLabel: 3 },
    { ...notice, linkLabel: null },
  ])("ignores malformed or missing notice %#", (value) => {
    expect(parseServerAnnouncement(value)).toBeNull();
  });

  it("uses Arabic when provided and falls back to English with its text direction", () => {
    const bilingual = { ...notice, ar: { title: "تحديث", body: "أهلاً بكم" } };
    expect(announcementText(bilingual, "ar-SA")).toEqual({
      ...bilingual.ar,
      lang: "ar",
      dir: "rtl",
    });
    expect(announcementText(bilingual, "en")).toEqual({
      ...notice.en,
      lang: "en",
      dir: "ltr",
    });
    expect(announcementText(notice, "ar")).toEqual({
      ...notice.en,
      lang: "en",
      dir: "ltr",
    });
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

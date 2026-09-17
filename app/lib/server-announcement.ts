export type AnnouncementText = { title: string; body: string };

export type ServerAnnouncement = {
  id: string;
  en: AnnouncementText;
  ar?: AnnouncementText;
  url?: string;
  linkLabel?: string;
  expiresAt: string;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DISMISSALS_KEY = "hakawati.announcement-dismissals";
const MAX_DISMISSALS = 32;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function parseText(value: unknown): AnnouncementText | null {
  if (!isRecord(value)) return null;
  const { title, body } = value;
  if (
    typeof title !== "string" ||
    !title.trim() ||
    title.length > 120 ||
    typeof body !== "string" ||
    !body.trim() ||
    body.length > 600
  ) {
    return null;
  }
  return { title: title.trim(), body: body.trim() };
}

// An invalid optional notice must never disable cloud sync or the catalog.
export function parseServerAnnouncement(
  value: unknown,
): ServerAnnouncement | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !UUID.test(value.id)
  ) {
    return null;
  }
  const en = parseText(value.en);
  const ar = value.ar === undefined ? undefined : parseText(value.ar);
  if (!en || ar === null) return null;
  if (
    typeof value.expiresAt !== "string" ||
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(
      value.expiresAt,
    ) ||
    !Number.isFinite(Date.parse(value.expiresAt))
  ) {
    return null;
  }
  if (value.url !== undefined) {
    if (typeof value.url !== "string" || value.url.length > 2048) return null;
    try {
      const url = new URL(value.url);
      if (url.protocol !== "https:" || url.username || url.password)
        return null;
    } catch {
      return null;
    }
  }
  if (
    value.linkLabel !== undefined &&
    (typeof value.linkLabel !== "string" ||
      !value.linkLabel.trim() ||
      value.linkLabel.trim().length > 80)
  ) {
    return null;
  }
  return {
    id: value.id.toLowerCase(),
    en,
    ...(ar ? { ar } : {}),
    ...(value.url === undefined ? {} : { url: value.url as string }),
    ...(value.linkLabel === undefined
      ? {}
      : { linkLabel: (value.linkLabel as string).trim() }),
    expiresAt: value.expiresAt,
  };
}

export function announcementText(
  announcement: ServerAnnouncement,
  locale: string,
) {
  return locale.toLowerCase().split(/[-_]/)[0] === "ar" && announcement.ar
    ? { ...announcement.ar, lang: "ar", dir: "rtl" as const }
    : { ...announcement.en, lang: "en", dir: "ltr" as const };
}

export function announcementServerKey(baseUrl: string) {
  const trimmed = baseUrl.trim().replace(/\/+$/, "").replace(/\/v1$/, "");
  try {
    return new URL(trimmed).toString().replace(/\/+$/, "");
  } catch {
    return trimmed;
  }
}

type Dismissal = { server: string; id: string };

function readDismissals(): Dismissal[] {
  try {
    const value: unknown = JSON.parse(
      localStorage.getItem(DISMISSALS_KEY) ?? "[]",
    );
    if (!Array.isArray(value)) return [];
    return value
      .filter(
        (entry): entry is Dismissal =>
          isRecord(entry) &&
          typeof entry.server === "string" &&
          entry.server.length <= 2048 &&
          typeof entry.id === "string" &&
          UUID.test(entry.id),
      )
      .slice(-MAX_DISMISSALS);
  } catch {
    return [];
  }
}

export function isAnnouncementDismissed(baseUrl: string, id: string) {
  const server = announcementServerKey(baseUrl);
  return readDismissals().some(
    (entry) => entry.server === server && entry.id === id,
  );
}

export function dismissAnnouncement(baseUrl: string, id: string) {
  const server = announcementServerKey(baseUrl);
  const entries = readDismissals().filter(
    (entry) => entry.server !== server || entry.id !== id,
  );
  try {
    localStorage.setItem(
      DISMISSALS_KEY,
      JSON.stringify([...entries, { server, id }].slice(-MAX_DISMISSALS)),
    );
  } catch {
    // The Home card still dismisses for this session when storage is unavailable.
  }
}

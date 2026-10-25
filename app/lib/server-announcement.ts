export type AnnouncementKind = "info" | "warning" | "outage";

export type AnnouncementText = {
  title: string;
  body: string;
  linkLabel?: string;
};

export type ServerAnnouncement = {
  id: string;
  kind: AnnouncementKind;
  en: AnnouncementText;
  ar?: AnnouncementText;
  url?: string;
  dismissible: boolean;
  expiresAt: string;
};

export type AnnouncementBodyPart = { text: string; url?: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE_TIME =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;
const BODY_LINK = /\[([^[\]\n]+)\]\(([^()\s]+)\)/g;
const KINDS: readonly AnnouncementKind[] = ["info", "warning", "outage"];
const MAX_ANNOUNCEMENTS = 10;
const DISMISSALS_KEY = "hakawati.announcement-dismissals";
const MAX_DISMISSALS = 32;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isSafeLink(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 2048) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password;
  } catch {
    return false;
  }
}

function parseLinkLabel(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") return null;
  const label = value.trim();
  return label && label.length <= 80 ? label : null;
}

export function announcementBodyParts(body: string): AnnouncementBodyPart[] {
  const parts: AnnouncementBodyPart[] = [];
  let text = "";
  let last = 0;
  for (const match of body.matchAll(BODY_LINK)) {
    text += body.slice(last, match.index);
    last = match.index + match[0].length;
    const label = match[1].trim();
    if (!label || label.length > 80 || !isSafeLink(match[2])) {
      text += match[0];
      continue;
    }
    if (text) parts.push({ text });
    text = "";
    parts.push({ text: label, url: match[2] });
  }
  text += body.slice(last);
  if (text) parts.push({ text });
  return parts;
}

function parseText(value: unknown): AnnouncementText | null {
  if (!isRecord(value)) return null;
  const { title, body } = value;
  const linkLabel = parseLinkLabel(value.linkLabel);
  if (
    typeof title !== "string" ||
    !title.trim() ||
    title.length > 120 ||
    typeof body !== "string" ||
    body.length > 4000 ||
    linkLabel === null
  ) {
    return null;
  }
  const visible = announcementBodyParts(body.trim())
    .map((part) => part.text)
    .join("");
  if (!visible.trim() || visible.length > 600) return null;
  return {
    title: title.trim(),
    body: body.trim(),
    ...(linkLabel ? { linkLabel } : {}),
  };
}

function isTimestamp(value: unknown): value is string {
  return (
    typeof value === "string" &&
    ISO_DATE_TIME.test(value) &&
    Number.isFinite(Date.parse(value))
  );
}

function parseAnnouncement(
  value: unknown,
  legacy: boolean,
): ServerAnnouncement | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !UUID.test(value.id) ||
    !isTimestamp(value.expiresAt) ||
    (value.url !== undefined && !isSafeLink(value.url))
  ) {
    return null;
  }
  const sharedLabel = legacy ? parseLinkLabel(value.linkLabel) : undefined;
  if (sharedLabel === null) return null;
  const withLabel = (text: unknown) =>
    sharedLabel && isRecord(text) ? { ...text, linkLabel: sharedLabel } : text;
  const en = parseText(withLabel(value.en));
  const ar =
    value.ar === undefined ? undefined : parseText(withLabel(value.ar));
  if (!en || ar === null) return null;
  return {
    id: value.id.toLowerCase(),
    kind: KINDS.includes(value.kind as AnnouncementKind)
      ? (value.kind as AnnouncementKind)
      : "info",
    en,
    ...(ar ? { ar } : {}),
    ...(value.url === undefined ? {} : { url: value.url as string }),
    dismissible: legacy || value.dismissible !== false,
    expiresAt: value.expiresAt,
  };
}

// An invalid optional notice must never disable cloud sync or the catalog.
export function parseServerAnnouncements(capabilities: {
  announcements?: unknown;
  announcement?: unknown;
}): ServerAnnouncement[] {
  if (!Array.isArray(capabilities.announcements)) {
    const legacy = parseAnnouncement(capabilities.announcement, true);
    return legacy ? [legacy] : [];
  }
  const announcements: ServerAnnouncement[] = [];
  for (const value of capabilities.announcements.slice(0, MAX_ANNOUNCEMENTS)) {
    const announcement = parseAnnouncement(value, false);
    if (
      announcement &&
      !announcements.some((other) => other.id === announcement.id)
    ) {
      announcements.push(announcement);
    }
  }
  return announcements;
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
    // Home still hides the notice for this session when storage is unavailable.
  }
}

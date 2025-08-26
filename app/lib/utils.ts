import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function decodeEscapedText(input: string): string {
  if (input === undefined || input === null) {
    return "";
  }
  const source = String(input);
  if (!source.includes("\\")) {
    return source;
  }
  return source.replace(
    /\\(u[0-9a-fA-F]{4}|x[0-9a-fA-F]{2}|n|r|t|b|f|v|0|\\|'|")/g,
    (_match, esc: string) => {
      switch (esc[0]) {
        case "u": {
          const hex = esc.slice(1);
          const code = parseInt(hex, 16);
          return Number.isFinite(code) ? String.fromCharCode(code) : _match;
        }
        case "x": {
          const hex = esc.slice(1);
          const code = parseInt(hex, 16);
          return Number.isFinite(code) ? String.fromCharCode(code) : _match;
        }
        case "n":
          return "\n";
        case "r":
          return "\r";
        case "t":
          return "\t";
        case "b":
          return "\b";
        case "f":
          return "\f";
        case "v":
          return "\v";
        case "0":
          return "\0";
        case "\\":
          return "\\";
        case "'":
          return "'";
        case '"':
          return '"';
        default:
          return _match;
      }
    },
  );
}

/**
 * Convert bytes to object URL. Chat-GPT method, no clue what this means but it fixed the problem.
 * @param bytes - The bytes to convert
 * @param mimeType - The mime type of the bytes
 * @returns The object URL
 */
export function bytesToObjectUrl(
  bytes?: Uint8Array | null,
  mimeType = "image/webp",
): string {
  if (!bytes || bytes.byteLength === 0) return "";
  const ab = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  const blob = new Blob([ab as unknown as ArrayBuffer], { type: mimeType });
  return URL.createObjectURL(blob);
}

/**
 * Format a date as a human-readable relative time (e.g., "3 months ago").
 */
export function formatRelativeTime(
  dateInput: Date | string | number,
  baseDate: Date = new Date(),
): string {
  const targetDate = new Date(dateInput);
  if (Number.isNaN(targetDate.getTime())) return "";

  const diffMs = targetDate.getTime() - baseDate.getTime();
  const absMs = Math.abs(diffMs);

  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

  const seconds = Math.round(diffMs / 1000);
  const minutes = Math.round(diffMs / (1000 * 60));
  const hours = Math.round(diffMs / (1000 * 60 * 60));
  const days = Math.round(diffMs / (1000 * 60 * 60 * 24));
  const weeks = Math.round(diffMs / (1000 * 60 * 60 * 24 * 7));
  const months = Math.round(diffMs / (1000 * 60 * 60 * 24 * 30));
  const years = Math.round(diffMs / (1000 * 60 * 60 * 24 * 365));

  if (absMs < 60 * 1000) return rtf.format(seconds, "second");
  if (absMs < 60 * 60 * 1000) return rtf.format(minutes, "minute");
  if (absMs < 24 * 60 * 60 * 1000) return rtf.format(hours, "hour");
  if (absMs < 7 * 24 * 60 * 60 * 1000) return rtf.format(days, "day");
  if (absMs < 30 * 24 * 60 * 60 * 1000) return rtf.format(weeks, "week");
  if (absMs < 365 * 24 * 60 * 60 * 1000) return rtf.format(months, "month");
  return rtf.format(years, "year");
}

/**
 * Format a date as an exact, locale-aware date-time string.
 */
export function formatExactDateTime(
  dateInput: Date | string | number,
  locale?: string | string[],
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = new Date(dateInput);
  if (Number.isNaN(date.getTime())) return "";
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  };
  return date.toLocaleString(locale, { ...defaultOptions, ...options });
}

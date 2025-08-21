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

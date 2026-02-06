import { create } from "zustand";

export const DEBUG_CONSOLE_LIMIT = 1000;
const MAX_NORMALIZE_DEPTH = 8;
const MAX_COLLECTION_ITEMS = 200;
const MAX_SEARCH_TEXT_LENGTH = 3000;

export type DebugConsoleLevel = "debug" | "info" | "log" | "warn" | "error";

export type DebugLogValue =
  | { kind: "primitive"; value: string }
  | { kind: "function"; name: string }
  | { kind: "symbol"; value: string }
  | { kind: "bigint"; value: string }
  | { kind: "date"; value: string }
  | { kind: "error"; name: string; message: string; stack?: string }
  | {
      kind: "array";
      items: DebugLogValue[];
      length: number;
      truncated: boolean;
    }
  | {
      kind: "object";
      name: string;
      entries: Array<{ key: string; value: DebugLogValue }>;
      truncated: boolean;
    }
  | { kind: "circular" }
  | { kind: "max-depth" };

export interface DebugConsoleEntry {
  id: number;
  timestamp: number;
  level: DebugConsoleLevel;
  message: string;
  searchText: string;
  values: DebugLogValue[];
}

interface DebugConsoleStoreType {
  entries: DebugConsoleEntry[];
  isOpen: boolean;
  addEntry: (level: DebugConsoleLevel, args: unknown[]) => void;
  clearEntries: () => void;
  setOpen: (open: boolean) => void;
  toggleOpen: () => void;
}

let sequence = 0;

function stringifyArg(arg: unknown): string {
  if (arg instanceof Error) {
    if (arg.stack) return arg.stack;
    return `${arg.name}: ${arg.message}`;
  }

  if (typeof arg === "string") return arg;
  if (typeof arg === "number" || typeof arg === "boolean" || arg == null) {
    return String(arg);
  }
  if (typeof arg === "bigint") return `${arg.toString()}n`;
  if (typeof arg === "symbol") return arg.toString();
  if (typeof arg === "function") {
    return `[Function ${arg.name || "anonymous"}]`;
  }

  const seen = new WeakSet<object>();
  try {
    return JSON.stringify(
      arg,
      (_key, value) => {
        if (typeof value === "object" && value !== null) {
          if (seen.has(value)) return "[Circular]";
          seen.add(value);
        }
        if (value instanceof Error) {
          return {
            name: value.name,
            message: value.message,
            stack: value.stack,
          };
        }
        return value;
      },
      2,
    );
  } catch {
    return String(arg);
  }
}

function normalizeValue(
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
): DebugLogValue {
  if (depth >= MAX_NORMALIZE_DEPTH) return { kind: "max-depth" };

  if (value === null) return { kind: "primitive", value: "null" };
  if (value === undefined) return { kind: "primitive", value: "undefined" };

  const type = typeof value;
  if (type === "string")
    return { kind: "primitive", value: JSON.stringify(value) };
  if (type === "number" || type === "boolean")
    return { kind: "primitive", value: String(value) };
  if (type === "bigint")
    return { kind: "bigint", value: `${value.toString()}n` };
  if (type === "symbol") return { kind: "symbol", value: value.toString() };
  if (type === "function") {
    const fn = value as (...args: unknown[]) => unknown;
    return { kind: "function", name: fn.name || "anonymous" };
  }

  if (!(value instanceof Object)) {
    return { kind: "primitive", value: String(value) };
  }

  if (seen.has(value)) return { kind: "circular" };
  seen.add(value);

  if (value instanceof Date)
    return { kind: "date", value: value.toISOString() };

  if (value instanceof Error) {
    return {
      kind: "error",
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }

  if (Array.isArray(value)) {
    const items = value
      .slice(0, MAX_COLLECTION_ITEMS)
      .map((item) => normalizeValue(item, seen, depth + 1));
    return {
      kind: "array",
      items,
      length: value.length,
      truncated: value.length > MAX_COLLECTION_ITEMS,
    };
  }

  if (value instanceof Map) {
    const mapEntries = Array.from(value.entries()).slice(
      0,
      MAX_COLLECTION_ITEMS,
    );
    return {
      kind: "object",
      name: "Map",
      entries: mapEntries.map(([k, v], index) => ({
        key: `${index}: ${stringifyArg(k)}`,
        value: normalizeValue(v, seen, depth + 1),
      })),
      truncated: value.size > MAX_COLLECTION_ITEMS,
    };
  }

  if (value instanceof Set) {
    const setValues = Array.from(value.values()).slice(0, MAX_COLLECTION_ITEMS);
    return {
      kind: "object",
      name: "Set",
      entries: setValues.map((v, index) => ({
        key: String(index),
        value: normalizeValue(v, seen, depth + 1),
      })),
      truncated: value.size > MAX_COLLECTION_ITEMS,
    };
  }

  const objectEntries = Object.entries(value).slice(0, MAX_COLLECTION_ITEMS);
  const ctor =
    value.constructor?.name && value.constructor.name !== "Object"
      ? value.constructor.name
      : "Object";

  return {
    kind: "object",
    name: ctor,
    entries: objectEntries.map(([key, entryValue]) => ({
      key,
      value: normalizeValue(entryValue, seen, depth + 1),
    })),
    truncated: Object.keys(value).length > MAX_COLLECTION_ITEMS,
  };
}

function normalizeArgs(args: unknown[]): DebugLogValue[] {
  const seen = new WeakSet<object>();
  return args.map((arg) => normalizeValue(arg, seen, 0));
}

export const useDebugConsoleStore = create<DebugConsoleStoreType>()((set) => ({
  entries: [],
  isOpen: false,
  addEntry: (level, args) =>
    set((state) => {
      const message =
        args.length > 0 ? args.map((arg) => stringifyArg(arg)).join(" ") : "";
      const entry: DebugConsoleEntry = {
        id: ++sequence,
        timestamp: Date.now(),
        level,
        message,
        searchText: `${level} ${message}`
          .toLowerCase()
          .slice(0, MAX_SEARCH_TEXT_LENGTH),
        values: normalizeArgs(args),
      };

      const nextEntries = [...state.entries, entry];
      const overflow = nextEntries.length - DEBUG_CONSOLE_LIMIT;
      return overflow > 0
        ? { entries: nextEntries.slice(overflow) }
        : { entries: nextEntries };
    }),
  clearEntries: () => set({ entries: [] }),
  setOpen: (open: boolean) => set({ isOpen: open }),
  toggleOpen: () => set((state) => ({ isOpen: !state.isOpen })),
}));

import type { DebugLogValue } from "@/store";

interface DebugLogValueViewProps {
  value: DebugLogValue;
}

function leafClassName(kind: DebugLogValue["kind"]): string {
  switch (kind) {
    case "primitive":
      return "text-foreground";
    case "function":
      return "text-blue-600";
    case "symbol":
      return "text-fuchsia-600";
    case "bigint":
      return "text-cyan-600";
    case "date":
      return "text-amber-600";
    case "error":
      return "text-rose-600";
    case "circular":
      return "text-rose-500";
    case "max-depth":
      return "text-muted-foreground";
    default:
      return "text-foreground";
  }
}

function objectSummary(value: Extract<DebugLogValue, { kind: "object" }>) {
  return `${value.name} {${value.entries.length}${value.truncated ? "+" : ""}}`;
}

function arraySummary(value: Extract<DebugLogValue, { kind: "array" }>) {
  return `Array(${value.length})`;
}

function renderLeaf(
  value: Exclude<DebugLogValue, { kind: "object" | "array" }>,
) {
  if (value.kind === "error") {
    const summary = `${value.name}: ${value.message}`;
    if (!value.stack) {
      return <span className={leafClassName(value.kind)}>{summary}</span>;
    }
    return (
      <details>
        <summary className={leafClassName(value.kind)}>{summary}</summary>
        <pre className="mt-1 whitespace-pre-wrap break-words text-[11px] text-muted-foreground">
          {value.stack}
        </pre>
      </details>
    );
  }

  if (value.kind === "function") {
    return (
      <span className={leafClassName(value.kind)}>
        {`[Function ${value.name}]`}
      </span>
    );
  }

  if (value.kind === "max-depth") {
    return (
      <span className={leafClassName(value.kind)}>[Max depth reached]</span>
    );
  }

  if (value.kind === "circular") {
    return <span className={leafClassName(value.kind)}>[Circular]</span>;
  }

  return <span className={leafClassName(value.kind)}>{value.value}</span>;
}

export function DebugLogValueView({ value }: DebugLogValueViewProps) {
  if (value.kind === "object") {
    return (
      <details>
        <summary className="cursor-pointer select-none text-foreground">
          {objectSummary(value)}
        </summary>
        <div className="mt-1 space-y-1 border-s border-border/80 ps-3">
          {value.entries.map((entry) => (
            <div key={entry.key} className="font-mono text-xs">
              <span className="text-muted-foreground">{entry.key}: </span>
              <DebugLogValueView value={entry.value} />
            </div>
          ))}
          {value.truncated && (
            <div className="text-muted-foreground font-mono text-xs">
              + more entries
            </div>
          )}
        </div>
      </details>
    );
  }

  if (value.kind === "array") {
    return (
      <details>
        <summary className="cursor-pointer select-none text-foreground">
          {arraySummary(value)}
        </summary>
        <div className="mt-1 space-y-1 border-s border-border/80 ps-3">
          {value.items.map((item, index) => (
            <div key={index} className="font-mono text-xs">
              <span className="text-muted-foreground">{index}: </span>
              <DebugLogValueView value={item} />
            </div>
          ))}
          {value.truncated && (
            <div className="text-muted-foreground font-mono text-xs">
              + more items
            </div>
          )}
        </div>
      </details>
    );
  }

  return renderLeaf(value);
}

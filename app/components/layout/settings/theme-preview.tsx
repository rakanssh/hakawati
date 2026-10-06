import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import type { ThemeId } from "@/themes/registry";

interface PreviewStyle {
  /** Extra classes for the reading column, the story lines, the player's turn and the composer. */
  column?: string;
  line?: string;
  entry?: string;
  composer?: string;
  send?: string;
  /** Replaces the theme's page background, e.g. to show scenery the app pages tone down. */
  surface?: string;
  /** Drawn behind and in front of the miniature screen, in a 160×100 frame. */
  back?: ReactNode;
  front?: ReactNode;
}

const star8 = (cx: number, cy: number, r: number) =>
  Array.from({ length: 16 }, (_, i) => {
    const radius = i % 2 ? r * 0.5 : r;
    const a = (i * Math.PI) / 8 - Math.PI / 2;
    return `${i ? "L" : "M"}${(cx + radius * Math.cos(a)).toFixed(1)} ${(cy + radius * Math.sin(a)).toFixed(1)}`;
  }).join("") + "Z";

const PREVIEWS: Record<ThemeId, PreviewStyle> = {
  light: {},
  dark: {},
  "brass-night": {
    entry: "rounded-none border-0 border-s border-s-primary bg-primary/10",
    composer:
      "rounded-none border-primary/60 outline outline-1 outline-offset-2 outline-primary/25",
    send: "rounded-none",
    back: (
      <path
        d={star8(14, 13, 6)}
        fill="none"
        stroke="var(--primary)"
        strokeWidth={0.8}
      />
    ),
  },
  orbit: {
    entry: "bg-card/50",
    back: (
      <>
        {[
          [12, 14],
          [26, 40],
          [8, 62],
          [140, 10],
          [150, 34],
          [133, 52],
          [20, 84],
        ].map(([x, y]) => (
          <circle key={`${x}-${y}`} cx={x} cy={y} r={0.7} fill="#eceeff" />
        ))}
        <circle cx={176} cy={112} r={50} fill="oklch(0.88 0.1 62 / 0.18)" />
        <circle cx={176} cy={112} r={44} fill="oklch(0.67 0.16 42)" />
        <path d="M130 90q12 -4 24 0t24 0v6h-48z" fill="oklch(0.79 0.11 58)" />
        <path d="M128 100q12 -4 24 0t24 0v8h-48z" fill="oklch(0.56 0.17 32)" />
        <circle
          cx={176}
          cy={112}
          r={44}
          fill="none"
          stroke="oklch(0.96 0.05 72 / 0.7)"
          strokeWidth={0.8}
        />
      </>
    ),
  },
  phosphor: {
    line: "bg-foreground/70 shadow-[0_0_4px_var(--foreground)]",
    entry:
      "h-[3px] w-[55%] rounded-none border-0 bg-primary shadow-[0_0_4px_var(--primary)]",
    composer: "rounded-none border-dashed",
    send: "rounded-none",
    front: (
      <rect
        x={2}
        y={2}
        width={156}
        height={96}
        rx={10}
        fill="none"
        stroke="#030503"
        strokeWidth={4}
      />
    ),
  },
  cartridge: {
    column:
      "bg-background/85 px-[5%] py-[5%] shadow-[0_-2px_0_0_var(--foreground),0_2px_0_0_var(--foreground),-2px_0_0_0_var(--foreground),2px_0_0_0_var(--foreground)]",
    line: "rounded-none",
    entry:
      "rounded-none border-0 bg-card shadow-[0_-1.5px_0_0_var(--primary),0_1.5px_0_0_var(--primary),-1.5px_0_0_0_var(--primary),1.5px_0_0_0_var(--primary)]",
    composer:
      "rounded-none border-0 shadow-[0_-2px_0_0_var(--foreground),0_2px_0_0_var(--foreground),-2px_0_0_0_var(--foreground),2px_0_0_0_var(--foreground)]",
    send: "rounded-none",
    back: (
      <>
        {["#160c2e", "#341752", "#74286f", "#d4566e", "#ffb065"].map(
          (colour, i) => (
            <rect
              key={colour}
              y={i * 12}
              width={160}
              height={i === 4 ? 100 : 12}
              fill={colour}
            />
          ),
        )}
        <circle cx={140} cy={14} r={5} fill="#ffe9b5" />
        <path
          d="M0 74l20-10l22 8l20-12l18 10l18-12l22 10l20-8l20 10v40h-160z"
          fill="#3b1f5e"
        />
        <path d="M0 84q80 -14 160 0v16h-160z" fill="#1c0f33" />
      </>
    ),
  },
  "rain-on-glass": {
    back: (
      <>
        <rect width={160} height={100} fill="oklch(0.86 0.01 250)" />
        {[0, 14, 26, 44, 58, 70, 92, 104, 120, 134, 148].map((x, i) => (
          <rect
            key={x}
            x={x}
            y={62 - (i % 3) * 9}
            width={12}
            height={40}
            fill={`oklch(${0.62 + (i % 3) * 0.05} 0.014 250)`}
          />
        ))}
        <rect width={160} height={100} fill="oklch(0.95 0.005 250 / 0.6)" />
        {[
          [9, 20, 1.4],
          [18, 46, 1],
          [11, 70, 1.8],
          [146, 16, 1.2],
          [150, 50, 1.7],
          [140, 74, 1],
        ].map(([x, y, r]) => (
          <circle
            key={`${x}-${y}`}
            cx={x}
            cy={y}
            r={r}
            fill="oklch(1 0 0 / 0.7)"
            stroke="oklch(0.4 0.02 250 / 0.35)"
            strokeWidth={0.4}
          />
        ))}
        <path
          d="M150 0v38"
          stroke="oklch(0.75 0.01 250 / 0.6)"
          strokeWidth={2}
          strokeLinecap="round"
        />
      </>
    ),
  },
  storybook: {
    entry: "rounded-[5px] border-foreground/60 border-s border-s-foreground/60",
    composer: "rounded-[6px] border-foreground/60",
    send: "rounded-full",
    back: (
      <>
        <circle cx={6} cy={8} r={26} fill="oklch(0.86 0.09 25 / 0.5)" />
        <circle cx={156} cy={6} r={24} fill="oklch(0.86 0.08 215 / 0.5)" />
        <circle cx={158} cy={96} r={28} fill="oklch(0.9 0.1 100 / 0.5)" />
        <circle cx={2} cy={96} r={24} fill="oklch(0.85 0.08 300 / 0.45)" />
        <circle
          cx={14}
          cy={15}
          r={4}
          fill="oklch(0.92 0.12 90 / 0.6)"
          stroke="oklch(0.8 0.15 75)"
          strokeWidth={0.8}
        />
        <path d="M148 88v-8" stroke="oklch(0.42 0.06 55)" strokeWidth={0.9} />
        <circle
          cx={148}
          cy={78}
          r={5}
          fill="oklch(0.88 0.09 140 / 0.7)"
          stroke="oklch(0.62 0.12 145)"
          strokeWidth={0.7}
        />
      </>
    ),
  },
  typewriter: {
    surface:
      "var(--typewriter-desk, none) 0 0 / 200px 129px, var(--app-background)",
    column:
      "bg-card px-[6%] pt-[6%] shadow-[0_6px_10px_-6px_oklch(0.25_0.05_55/0.5)]",
    entry: "h-[3px] w-[60%] rounded-none border-0 bg-primary/80",
    composer:
      "rounded-[2px] border-0 shadow-[0_0_0_1.5px_oklch(0.24_0.006_250)]",
    send: "rounded-full bg-[oklch(0.2_0.01_60)]",
    back: (
      <rect
        x={18}
        y={70}
        width={124}
        height={40}
        rx={7}
        fill="oklch(0.16 0.006 250)"
      />
    ),
    front: (
      <rect
        x={33}
        y={70}
        width={94}
        height={4}
        rx={2}
        fill="oklch(0.22 0.005 250)"
      />
    ),
  },
};

function Art({ children }: { children: ReactNode }) {
  return (
    <svg
      className="absolute inset-0 h-full w-full"
      viewBox="0 0 160 100"
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

/** A miniature of the play screen, painted with the theme's own colours. */
export function ThemePreview({
  id,
  className,
}: {
  id: ThemeId;
  className?: string;
}) {
  const style = PREVIEWS[id];
  const line = cn("h-[3px] rounded-full bg-foreground/55", style.line);

  return (
    <div
      className={cn(
        `theme-${id}`,
        "relative isolate aspect-[16/10] overflow-hidden bg-(--app-background) bg-(image:--app-surface-gradient)",
        className,
      )}
      style={style.surface ? { background: style.surface } : undefined}
      aria-hidden="true"
    >
      {style.back && <Art>{style.back}</Art>}
      <div
        className={cn(
          "absolute inset-x-[20%] top-[10%] bottom-[28%] flex flex-col justify-end gap-[5%]",
          style.column,
        )}
      >
        <span className={cn(line, "w-full")} />
        <span className={cn(line, "w-[92%]")} />
        <span className={cn(line, "w-[68%]")} />
        <span
          className={cn(
            "h-[16%] w-[80%] shrink-0 rounded-[2px] border border-border/60 border-s-2 border-s-log-do bg-card/70",
            style.entry,
          )}
        />
        <span className={cn(line, "w-full")} />
        <span className={cn(line, "w-[84%]")} />
      </div>
      <div
        className={cn(
          "absolute inset-x-[16%] bottom-[6%] flex h-[15%] items-center justify-end rounded-[3px] border border-border bg-card pe-[1.5%]",
          style.composer,
        )}
      >
        <span
          className={cn(
            "aspect-square h-[62%] rounded-[2px] bg-primary",
            style.send,
          )}
        />
      </div>
      {style.front && <Art>{style.front}</Art>}
    </div>
  );
}

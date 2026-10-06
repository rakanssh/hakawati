import { createContext, useContext, type ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/**
 * "boxed" sections are cards, as in the Settings dialog. "plain" sections are headings over open space,
 * for narrow surfaces such as the story panel, where cards inside a panel would feel heavy.
 */
export type SettingsLayoutVariant = "boxed" | "plain";

const SettingsLayoutContext = createContext<SettingsLayoutVariant>("boxed");

export function SettingsLayoutProvider({
  variant,
  children,
}: {
  variant: SettingsLayoutVariant;
  children: ReactNode;
}) {
  return (
    <SettingsLayoutContext.Provider value={variant}>
      {children}
    </SettingsLayoutContext.Provider>
  );
}

export function SettingsStack({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  const variant = useContext(SettingsLayoutContext);
  return (
    <div
      className={cn(
        "@container flex max-w-full flex-col",
        variant === "plain" ? "gap-6" : "gap-5",
        className,
      )}
    >
      {children}
    </div>
  );
}

export function SettingsPanel({
  title,
  className,
  children,
}: {
  title: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  const variant = useContext(SettingsLayoutContext);
  if (variant === "plain") {
    return (
      <section className={cn("flex flex-col gap-4", className)}>
        <h3
          data-sidebar-heading=""
          className="border-b border-sidebar-border/80 pb-2 text-[0.8rem] font-semibold text-sidebar-foreground/90"
        >
          {title}
        </h3>
        {children}
      </section>
    );
  }
  return (
    <section
      className={cn(
        "flex flex-col gap-4 rounded-xs border border-border/70 bg-background/60 p-4",
        className,
      )}
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-semibold leading-none">{title}</h3>
      </div>
      {children}
    </section>
  );
}

export function SettingsField({
  label,
  description,
  htmlFor,
  children,
  className,
}: {
  label: ReactNode;
  description?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-2", className)}>
      <div className="grid gap-1">
        <Label htmlFor={htmlFor}>{label}</Label>
        {description ? (
          <p className="text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {children}
    </div>
  );
}

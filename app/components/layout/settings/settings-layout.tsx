import type { ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function SettingsStack({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex max-w-full flex-col gap-5", className)}>
      {children}
    </div>
  );
}

export function SettingsPanel({
  title,
  description: _description,
  className,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
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

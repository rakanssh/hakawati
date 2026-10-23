import { useMemo, type MouseEvent } from "react";
import type { MessageDescriptor } from "@lingui/core";
import { msg } from "@lingui/core/macro";
import { useLingui } from "@lingui/react/macro";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  CircleMinus,
  PenLine,
  Sparkles,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { toast } from "sonner";
import { parseReleaseNotes, type ReleaseNotesKind } from "@/lib/release-notes";
import { cn } from "@/lib/utils";

const SECTIONS: Record<
  Exclude<ReleaseNotesKind, "other">,
  { label: MessageDescriptor; icon: LucideIcon; marker: string }
> = {
  added: {
    label: msg({ message: "New", context: "Release notes section" }),
    icon: Sparkles,
    marker: "bg-primary",
  },
  changed: {
    label: msg({ message: "Changed", context: "Release notes section" }),
    icon: PenLine,
    marker: "bg-log-say",
  },
  fixed: {
    label: msg({ message: "Fixed", context: "Release notes section" }),
    icon: Wrench,
    marker: "bg-success",
  },
  removed: {
    label: msg({ message: "Removed", context: "Release notes section" }),
    icon: CircleMinus,
    marker: "bg-destructive",
  },
};

/** Release notes from the updater: a CHANGELOG.md section, written in English. */
export function ReleaseNotes({
  notes,
  className,
}: {
  notes: string;
  className?: string;
}) {
  const { t } = useLingui();
  const sections = useMemo(() => parseReleaseNotes(notes), [notes]);
  const components = useMemo<Components>(
    () => ({
      a: ({ href, children }) => (
        <a
          href={href}
          onClick={(event: MouseEvent<HTMLAnchorElement>) => {
            event.preventDefault();
            void openUrl(event.currentTarget.href).catch(() => {
              toast.error(t`Could not open the link`);
            });
          }}
          className="font-medium text-primary underline underline-offset-4 hover:text-primary/80"
        >
          {children}
        </a>
      ),
    }),
    [t],
  );

  if (!sections) {
    return (
      <div
        lang="en"
        dir="auto"
        className={cn(
          "prose prose-sm prose-neutral dark:prose-invert max-w-none",
          className,
        )}
      >
        <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
          {notes}
        </ReactMarkdown>
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      {sections.map((section, sectionIndex) => {
        const known = section.kind === "other" ? null : SECTIONS[section.kind];
        const Icon = known?.icon;
        return (
          <section key={sectionIndex} className="flex flex-col gap-2.5">
            {section.title ? (
              <h3
                data-sidebar-heading=""
                className="flex items-center gap-2 text-xs font-semibold text-muted-foreground"
              >
                {Icon ? (
                  <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                ) : null}
                {known ? (
                  t(known.label)
                ) : (
                  <span lang="en">{section.title}</span>
                )}
              </h3>
            ) : null}
            <ul className="flex flex-col gap-2">
              {section.items.map((item, itemIndex) => (
                <li
                  key={itemIndex}
                  lang="en"
                  dir="auto"
                  className="flex gap-3 text-sm leading-relaxed"
                >
                  <span
                    aria-hidden="true"
                    className={cn(
                      "mt-2 size-[5px] shrink-0 rotate-45",
                      known?.marker ?? "bg-muted-foreground",
                    )}
                  />
                  <div className="min-w-0 flex-1 break-words [&_code]:rounded-xs [&_code]:bg-muted [&_code]:px-1 [&_p+p]:mt-2 [&_ul]:mt-1 [&_ul]:list-disc [&_ul]:ps-4">
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={components}
                    >
                      {item}
                    </ReactMarkdown>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}

import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useLingui } from "@lingui/react/macro";

type ScenarioBreadcrumbProps = {
  to: string;
  search?: Record<string, unknown>;
  parent: ReactNode;
  current: ReactNode;
};

export function ScenarioBreadcrumb({
  to,
  search,
  parent,
  current,
}: ScenarioBreadcrumbProps) {
  const { t } = useLingui();

  return (
    <nav aria-label={t`Scenarios`} className="min-w-0">
      <ol className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
        <li className="min-w-0">
          <Link
            to={to}
            search={search}
            className="block truncate rounded-xs text-primary underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
          >
            {parent}
          </Link>
        </li>
        <li aria-hidden="true">/</li>
        <li aria-current="page" className="shrink-0">
          {current}
        </li>
      </ol>
    </nav>
  );
}

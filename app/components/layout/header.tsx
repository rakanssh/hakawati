import { ThemeToggle } from "./theme-toggle";
import { Link } from "@tanstack/react-router";
import { Trans } from "@lingui/react/macro";

export function Header() {
  return (
    <header className="absolute top-0 right-0 p-4 flex items-center gap-4">
      <Link to="/tales" className="text-sm underline">
        <Trans>Tales</Trans>
      </Link>
      <Link to="/scenarios" className="text-sm underline">
        <Trans>Scenarios</Trans>
      </Link>
      <ThemeToggle />
    </header>
  );
}

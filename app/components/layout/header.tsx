import { ThemeToggle } from "./theme-toggle";

export function Header() {
  return (
    <header className="absolute top-0 right-0 p-4">
      <ThemeToggle />
    </header>
  );
}

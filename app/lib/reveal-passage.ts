const FLASH_MS = 1600;
const timers = new WeakMap<HTMLElement, number>();

function passageElements(id: string): HTMLElement[] {
  const value = CSS.escape(id);
  return [
    ...document.querySelectorAll<HTMLElement>(
      `[data-story-segment-id="${value}"], [data-log-entry-id="${value}"]`,
    ),
  ];
}

export function isPassageShown(id: string): boolean {
  return passageElements(id).length > 0;
}

/** Scrolls the story to a passage and flashes it. */
export function revealPassage(id: string) {
  const elements = passageElements(id);
  elements[0]?.scrollIntoView({ block: "center", behavior: "smooth" });
  for (const element of elements) {
    window.clearTimeout(timers.get(element));
    element.removeAttribute("data-passage-flash");
    void element.offsetWidth;
    element.setAttribute("data-passage-flash", "");
    timers.set(
      element,
      window.setTimeout(
        () => element.removeAttribute("data-passage-flash"),
        FLASH_MS,
      ),
    );
  }
}

export type ReleaseNotesKind =
  | "added"
  | "changed"
  | "fixed"
  | "removed"
  | "other";

export type ReleaseNotesSection = {
  kind: ReleaseNotesKind;
  title: string;
  items: string[];
};

const KINDS: Record<string, ReleaseNotesKind> = {
  added: "added",
  new: "added",
  changed: "changed",
  fixed: "fixed",
  removed: "removed",
};

const HEADING = /^#{1,6}[ \t]+(.+?)[ \t]*#*[ \t]*$/;
const ITEM = /^[-*+][ \t]+(.*)$/;
const INDENT = /^(?: {1,4}|\t)/;

export function parseReleaseNotes(notes: string): ReleaseNotesSection[] | null {
  const sections: ReleaseNotesSection[] = [];
  let item: string[] | null = null;
  let afterBlank = false;

  const finishItem = () => {
    if (item) sections[sections.length - 1].items.push(item.join("\n"));
    item = null;
  };

  for (const line of notes.replace(/\r\n?/g, "\n").split("\n")) {
    if (!line.trim()) {
      afterBlank = true;
      continue;
    }
    const heading = line.match(HEADING);
    const entry = line.match(ITEM);
    if (heading) {
      finishItem();
      const title = heading[1];
      sections.push({
        kind: KINDS[title.toLowerCase()] ?? "other",
        title,
        items: [],
      });
    } else if (entry) {
      finishItem();
      if (!sections.length)
        sections.push({ kind: "other", title: "", items: [] });
      item = [entry[1]];
    } else if (item && (INDENT.test(line) || !afterBlank)) {
      item.push((afterBlank ? "\n" : "") + line.replace(INDENT, ""));
    } else {
      return null;
    }
    afterBlank = false;
  }
  finishItem();

  const filled = sections.filter((section) => section.items.length);
  return filled.length ? filled : null;
}

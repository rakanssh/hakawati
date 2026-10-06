/**
 * In-place editing of rendered story text. The passage stays formatted while it is edited; the edited
 * entry's Markdown is rebuilt from the DOM when editing ends.
 */

const SEGMENT = "data-story-segment-id";

const segmentOf = (node: Node) =>
  (node.nodeType === Node.ELEMENT_NODE
    ? (node as Element)
    : node.parentElement
  )?.closest(`[${SEGMENT}]`);

/** Escapes characters that would otherwise turn plain text into Markdown formatting. */
const escapeMarkdown = (text: string) => text.replace(/([\\*_])/g, "\\$1");

/** Whether a text node outside any segment span sits right beside the edited entry's text. */
function besideSegment(node: Node, id: string) {
  const isSegment = (sibling: Node | null) =>
    sibling instanceof Element && sibling.getAttribute(SEGMENT) === id;
  return isSegment(node.previousSibling) || isSegment(node.nextSibling);
}

/**
 * Rebuilds one entry's Markdown from an edited story DOM: its text in reading order, paragraphs
 * separated by blank lines, line breaks kept, and bold and italic written back as `**` and `*`.
 */
export function serializeSegment(root: HTMLElement, id: string): string {
  type Run = { block: Element; strong: boolean; em: boolean; text: string };
  const runs: Run[] = [];
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
  );

  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const isBreak = node instanceof HTMLBRElement;
    if (node.nodeType !== Node.TEXT_NODE && !isBreak) continue;
    const segment = segmentOf(node);
    const ours = segment
      ? segment.getAttribute(SEGMENT) === id
      : besideSegment(node, id);
    if (!ours) continue;

    const parent = isBreak ? (node as Element) : node.parentElement;
    const block = parent?.closest("p") ?? root;
    const strong = !!parent?.closest("strong, b");
    const em = !!parent?.closest("em, i");
    const text = isBreak ? "\n" : escapeMarkdown(node.textContent ?? "");
    const last = runs.at(-1);
    if (
      last &&
      last.block === block &&
      last.strong === strong &&
      last.em === em
    ) {
      last.text += text;
    } else {
      runs.push({ block, strong, em, text });
    }
  }

  let out = "";
  let previousBlock: Element | null = null;
  for (const run of runs) {
    if (previousBlock && run.block !== previousBlock) out += "\n\n";
    previousBlock = run.block;
    const marker = (run.strong ? "**" : "") + (run.em ? "*" : "");
    // Emphasis markers must hug the words, so surrounding spaces stay outside them.
    const [, lead, core, trail] = /^(\s*)([\s\S]*?)(\s*)$/.exec(run.text)!;
    out +=
      marker && core ? `${lead}${marker}${core}${marker}${trail}` : run.text;
  }
  return out;
}

/** Re-attaches the original entry's surrounding whitespace, which the rendered text does not keep. */
export function withOriginalSpacing(original: string, edited: string) {
  const lead = /^\s*/.exec(original)?.[0] ?? "";
  const trail = /\s*$/.exec(original)?.[0] ?? "";
  return lead + edited.trim() + trail;
}

/** Puts the caret where the reader clicked, or at the end of the entry's text. */
export function placeCaret(
  root: HTMLElement,
  id: string,
  point?: { x: number; y: number } | null,
) {
  const selection = window.getSelection();
  if (!selection) return;
  let range: Range | null = null;

  if (point) {
    type CaretDocument = Document & {
      caretPositionFromPoint?: (
        x: number,
        y: number,
      ) => { offsetNode: Node; offset: number } | null;
      caretRangeFromPoint?: (x: number, y: number) => Range | null;
    };
    const doc = document as CaretDocument;
    const position = doc.caretPositionFromPoint?.(point.x, point.y);
    if (position) {
      range = document.createRange();
      range.setStart(position.offsetNode, position.offset);
    } else {
      range = doc.caretRangeFromPoint?.(point.x, point.y) ?? null;
    }
    if (range && segmentOf(range.startContainer)?.getAttribute(SEGMENT) !== id)
      range = null;
  }

  if (!range) {
    const spans = root.querySelectorAll(`[${SEGMENT}="${CSS.escape(id)}"]`);
    const last = spans[spans.length - 1];
    if (!last) return;
    range = document.createRange();
    range.selectNodeContents(last);
  }
  // A clicked point is already a caret; otherwise go to the end of the entry.
  if (!range.collapsed) range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
}

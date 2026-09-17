import ReactMarkdown from "react-markdown";
import type { Element, Root, Text } from "hast";
import { decodeString } from "micromark-util-decode-string";

interface StorySegment {
  id: string;
  text: string;
}

interface StoryTextProps {
  text?: string;
  segments?: StorySegment[];
  onEditSegment?: (id: string) => void;
  highlightedSegmentId?: string;
}

interface SegmentRange {
  id: string;
  start: number;
  end: number;
}

const escapedCharacterOrReference =
  /^(?:\\[!-/:-@[-`{-~]|&(?:#(?:\d{1,7}|x[\da-f]{1,6})|[\da-z]{1,31});)/i;

/** Relate decoded Markdown characters to their original, untrimmed source. */
function getSourceOffsets(node: Text, source: string, decode: boolean) {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) return null;

  const offsets: number[] = [];
  let cursor = start;
  let valueIndex = 0;
  while (valueIndex < node.value.length) {
    let matched = false;
    while (cursor < end) {
      const reference =
        decode && (source[cursor] === "\\" || source[cursor] === "&")
          ? source
              .slice(cursor, Math.min(cursor + 34, end))
              .match(escapedCharacterOrReference)?.[0]
          : undefined;
      const decoded = reference ? decodeString(reference) : undefined;
      if (
        reference &&
        decoded &&
        decoded !== reference &&
        node.value.startsWith(decoded, valueIndex)
      ) {
        offsets.push(...Array<number>(decoded.length).fill(cursor));
        cursor += reference.length;
        valueIndex += decoded.length;
        matched = true;
        break;
      }
      if (source[cursor] === node.value[valueIndex]) {
        offsets.push(cursor++);
        valueIndex++;
        matched = true;
        break;
      }
      if (source[cursor] === "\r" && node.value[valueIndex] === "\n") {
        offsets.push(cursor);
        cursor += source[cursor + 1] === "\n" ? 2 : 1;
        valueIndex++;
        matched = true;
        break;
      }
      // Markdown removes indentation and code delimiters from visible text.
      cursor++;
    }
    if (!matched) {
      offsets.push(Math.max(start, end - 1));
      valueIndex++;
    }
  }
  return offsets;
}

function rehypeStorySegments({
  source,
  ranges,
}: {
  source: string;
  ranges: SegmentRange[];
}) {
  return (tree: Root) => {
    const focusableSegments = new Set<string>();

    function rangeAt(offset: number) {
      let left = 0;
      let right = ranges.length - 1;
      while (left <= right) {
        const middle = Math.floor((left + right) / 2);
        const range = ranges[middle];
        if (offset < range.start) right = middle - 1;
        else if (offset >= range.end) left = middle + 1;
        else return range;
      }
      return undefined;
    }

    function visit(parent: Root | Element) {
      for (let index = 0; index < parent.children.length; index++) {
        const child = parent.children[index];
        if (child.type === "element") {
          visit(child);
          continue;
        }
        if (child.type !== "text") continue;
        const offsets = getSourceOffsets(
          child,
          source,
          parent.type !== "element" || parent.tagName !== "code",
        );
        if (!offsets) continue;

        const runs: { id: string; text: string }[] = [];
        let characterIndex = 0;
        for (const character of child.value) {
          const range = rangeAt(offsets[characterIndex]);
          characterIndex += character.length;
          if (!range) continue;
          const previous = runs.at(-1);
          if (previous?.id === range.id) {
            previous.text += character;
          } else {
            runs.push({ id: range.id, text: character });
          }
        }
        if (runs.length === 0) continue;

        const spans: Element[] = runs.map((run) => {
          const firstRun =
            /\S/.test(run.text) && !focusableSegments.has(run.id);
          if (firstRun) focusableSegments.add(run.id);
          return {
            type: "element",
            tagName: "span",
            properties: {
              "data-story-segment-id": run.id,
              "data-story-segment-start": firstRun,
            },
            children: [{ type: "text", value: run.text }],
          };
        });
        parent.children.splice(index, 1, ...spans);
        index += spans.length - 1;
      }
    }

    visit(tree);
  };
}

function getOnlySegmentId(node?: Element) {
  const ids = new Set<string>();
  function visit(element: Element) {
    const id = element.properties["data-story-segment-id"];
    if (typeof id === "string") ids.add(id);
    for (const child of element.children) {
      if (child.type === "element") visit(child);
    }
  }
  if (node) visit(node);
  return ids.size === 1 ? ids.values().next().value : undefined;
}

/** Read-only story formatting; the original Markdown remains the editable text. */
export function StoryText({
  text = "",
  segments,
  onEditSegment,
  highlightedSegmentId,
}: StoryTextProps) {
  const source = segments?.map((segment) => segment.text).join("") ?? text;
  let offset = 0;
  const ranges =
    segments?.map((segment) => {
      const range = {
        id: segment.id,
        start: offset,
        end: offset + segment.text.length,
      };
      offset = range.end;
      return range;
    }) ?? [];

  return (
    <div className="whitespace-normal break-words [&>p+p]:mt-3">
      <ReactMarkdown
        allowedElements={["p", "strong", "em", "br", "span"]}
        unwrapDisallowed
        skipHtml
        rehypePlugins={
          segments ? [[rehypeStorySegments, { source, ranges }]] : []
        }
        components={{
          p: ({ children, node }) => {
            const id = onEditSegment ? getOnlySegmentId(node) : undefined;
            return (
              <p
                className="m-0 whitespace-pre-wrap"
                onClick={
                  id && onEditSegment
                    ? (event) => {
                        // Text runs route themselves; only fill blank paragraph space.
                        if (event.target === event.currentTarget) {
                          onEditSegment(id);
                        }
                      }
                    : undefined
                }
              >
                {children}
              </p>
            );
          },
          span: ({ children, node }) => {
            const id = node?.properties["data-story-segment-id"];
            if (typeof id !== "string") return <span>{children}</span>;
            const isFocusable =
              onEditSegment &&
              node?.properties["data-story-segment-start"] === true;
            return (
              <span
                data-story-segment-id={id}
                className={[
                  id === highlightedSegmentId &&
                    "box-decoration-clone rounded-[0.15rem] bg-primary/10",
                  onEditSegment && "cursor-pointer",
                  isFocusable &&
                    "focus-visible:rounded-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                ]
                  .filter(Boolean)
                  .join(" ")}
                onClick={onEditSegment ? () => onEditSegment(id) : undefined}
                role={isFocusable ? "button" : undefined}
                tabIndex={isFocusable ? 0 : undefined}
                aria-label={isFocusable ? "Edit entry" : undefined}
                onKeyDown={
                  isFocusable
                    ? (event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          onEditSegment(id);
                        }
                      }
                    : undefined
                }
              >
                {children}
              </span>
            );
          },
        }}
      >
        {source}
      </ReactMarkdown>
    </div>
  );
}

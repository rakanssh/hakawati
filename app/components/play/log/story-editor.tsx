import { useLayoutEffect, useRef, type ReactNode } from "react";
import {
  placeCaret,
  serializeSegment,
  withOriginalSpacing,
} from "./story-edit";

interface StoryEditorProps {
  /** The passage exactly as it is normally rendered. */
  markup: ReactNode;
  segmentId: string;
  /** The entry's Markdown before editing. */
  original: string;
  point?: { x: number; y: number } | null;
  onCommit: (text: string) => void;
  onCancel: () => void;
}

/**
 * Edits one entry of a passage in place. The passage keeps its normal formatting and layout, only the
 * edited entry's text takes the caret, and its Markdown is rebuilt when editing ends: Enter or leaving
 * saves, Escape cancels, Shift+Enter starts a new line.
 */
export function StoryEditor({
  markup,
  segmentId,
  original,
  point,
  onCommit,
  onCancel,
}: StoryEditorProps) {
  const sourceRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const initialRef = useRef("");
  const doneRef = useRef(false);

  // Copy the rendered passage into an editor React doesn't manage, so typing never fights reconciliation.
  useLayoutEffect(() => {
    const source = sourceRef.current?.firstElementChild;
    const editor = editorRef.current;
    if (!source || !editor) return;
    editor.innerHTML = source.innerHTML;
    for (const span of editor.querySelectorAll("[data-story-segment-id]")) {
      span.removeAttribute("role");
      span.removeAttribute("tabindex");
      span.removeAttribute("aria-label");
      if (span.getAttribute("data-story-segment-id") === segmentId) {
        span.setAttribute("data-story-editing", "");
      } else {
        span.setAttribute("contenteditable", "false");
      }
    }
    initialRef.current = serializeSegment(editor, segmentId);
    doneRef.current = false;
    editor.focus({ preventScroll: true });
    placeCaret(editor, segmentId, point);
    // One editing session per mount; the parent remounts the editor for another entry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const finish = () => {
    const editor = editorRef.current;
    if (doneRef.current || !editor) return;
    doneRef.current = true;
    const next = serializeSegment(editor, segmentId);
    if (next === initialRef.current) onCancel();
    else onCommit(withOriginalSpacing(original, next));
  };

  return (
    <>
      <div ref={sourceRef} hidden>
        {markup}
      </div>
      <div
        ref={editorRef}
        contentEditable
        role="textbox"
        aria-multiline="true"
        aria-label="Edit entry"
        data-story-editor=""
        className="whitespace-normal break-words outline-none [&>p+p]:mt-3"
        onBlur={finish}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            doneRef.current = true;
            onCancel();
          } else if (event.key === "Enter" && event.shiftKey) {
            event.preventDefault();
            document.execCommand("insertLineBreak");
          } else if (event.key === "Enter") {
            event.preventDefault();
            finish();
          }
        }}
        onPaste={(event) => {
          // Paste as plain text in the passage's own formatting.
          event.preventDefault();
          document.execCommand(
            "insertText",
            false,
            event.clipboardData.getData("text/plain"),
          );
        }}
      />
    </>
  );
}

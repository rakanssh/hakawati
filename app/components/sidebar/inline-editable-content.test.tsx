import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InlineEditableContent } from "./inline-editable-content";

describe.each(["block", "inline"] as const)(
  "InlineEditableContent (%s)",
  (variant) => {
    let root: Root;
    let container: HTMLDivElement;

    beforeEach(() => {
      (
        globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
      ).IS_REACT_ACT_ENVIRONMENT = true;
      container = document.createElement("div");
      document.body.append(container);
      root = createRoot(container);
    });

    afterEach(() => {
      act(() => root.unmount());
      container.remove();
      window.getSelection()?.removeAllRanges();
      vi.restoreAllMocks();
    });

    function renderEditor(initialValue = "Original passage") {
      const onCommit = vi.fn();
      const onCancel = vi.fn();
      act(() =>
        root.render(
          createElement(InlineEditableContent, {
            initialValue,
            onCommit,
            onCancel,
            variant,
          }),
        ),
      );
      const editor = container.querySelector<HTMLElement>('[role="textbox"]')!;
      return { editor, onCommit, onCancel };
    }

    function press(editor: HTMLElement, key: string, shiftKey = false) {
      const event = new KeyboardEvent("keydown", {
        key,
        shiftKey,
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        editor.dispatchEvent(event);
      });
      return event;
    }

    function blur(editor: HTMLElement) {
      act(() => {
        editor.blur();
      });
    }

    it("focuses the new editor without scrolling and places the caret at the end", () => {
      const focus = vi.spyOn(HTMLElement.prototype, "focus");
      const initialValue = "An opening **passage**.";
      const { editor, onCommit } = renderEditor(initialValue);

      expect(focus).toHaveBeenCalledOnce();
      expect(focus.mock.contexts[0]).toBe(editor);
      expect(focus).toHaveBeenCalledWith({ preventScroll: true });
      expect(document.activeElement).toBe(editor);
      expect(editor.textContent).toBe(initialValue);
      const selection = window.getSelection()!;
      expect(selection.rangeCount).toBe(1);
      expect(selection.isCollapsed).toBe(true);
      const caret = selection.getRangeAt(0);
      expect(caret.endContainer).toBe(editor);
      expect(caret.endOffset).toBe(editor.childNodes.length);
      expect(onCommit).not.toHaveBeenCalled();
    });

    it("commits an Enter submission only once when blur follows", () => {
      const { editor, onCommit, onCancel } = renderEditor();
      editor.textContent = "The revised passage.";

      expect(press(editor, "Enter").defaultPrevented).toBe(true);
      blur(editor);

      expect(onCommit).toHaveBeenCalledExactlyOnceWith("The revised passage.");
      expect(onCancel).not.toHaveBeenCalled();
    });

    it("cancels on Escape without committing the draft when blur follows", () => {
      const { editor, onCommit, onCancel } = renderEditor();
      editor.textContent = "An abandoned revision.";

      expect(press(editor, "Escape").defaultPrevented).toBe(true);
      blur(editor);

      expect(onCancel).toHaveBeenCalledOnce();
      expect(onCommit).not.toHaveBeenCalled();
    });

    it("closes an unchanged draft on blur without writing it", () => {
      const { editor, onCommit, onCancel } = renderEditor();

      blur(editor);

      expect(onCancel).toHaveBeenCalledOnce();
      expect(onCommit).not.toHaveBeenCalled();
    });

    it("preserves raw Markdown and literal HTML when a draft is committed on blur", () => {
      const initialValue =
        "**Listen,** she said.\n\n*Wait here.* `door` <b>literal</b>";
      const nextValue = `${initialValue}\n\n_Then leave_ through [the arch](https://example.com).`;
      const { editor, onCommit, onCancel } = renderEditor(initialValue);
      expect(editor.textContent).toBe(initialValue);
      expect(editor.childElementCount).toBe(0);
      editor.textContent = nextValue;

      blur(editor);

      expect(onCommit).toHaveBeenCalledExactlyOnceWith(nextValue);
      expect(onCancel).not.toHaveBeenCalled();
    });

    it("keeps Shift+Enter available for a newline until the draft is committed", () => {
      const { editor, onCommit } = renderEditor();

      expect(press(editor, "Enter", true).defaultPrevented).toBe(false);
      expect(onCommit).not.toHaveBeenCalled();
      editor.textContent = "First line\nSecond line";
      blur(editor);

      expect(onCommit).toHaveBeenCalledExactlyOnceWith(
        "First line\nSecond line",
      );
    });

    it("commits a new edit after the same mounted editor is focused again", () => {
      const { editor, onCommit } = renderEditor();
      editor.textContent = "A first revision";
      blur(editor);
      expect(onCommit).toHaveBeenCalledExactlyOnceWith("A first revision");
      act(() => editor.focus());
      editor.textContent = "A later revision";

      blur(editor);

      expect(onCommit).toHaveBeenCalledTimes(2);
      expect(onCommit).toHaveBeenLastCalledWith("A later revision");
    });
  },
);

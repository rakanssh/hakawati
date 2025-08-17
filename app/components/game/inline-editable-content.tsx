import React, { useEffect, useRef } from "react";

interface InlineEditableContentProps {
  initialValue: string;
  onCommit: (next: string) => void;
  onCancel: () => void;
}

export function InlineEditableContent(props: InlineEditableContentProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const { initialValue, onCommit, onCancel } = props;

  useEffect(() => {
    if (ref.current) {
      ref.current.textContent = initialValue;
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(ref.current);
      range.collapse(false);
      selection?.removeAllRanges();
      selection?.addRange(range);
    }
  }, [initialValue]);

  const finish = () => {
    const next = ref.current?.textContent ?? "";
    onCommit(next);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      finish();
    }
    if (e.key === "Escape") {
      e.preventDefault();
      onCancel();
    }
  };

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onBlur={finish}
      onKeyDown={onKeyDown}
      className="md:text-base whitespace-pre-wrap break-words outline-none ml-2"
      style={{ minHeight: 0 }}
      role="textbox"
      aria-multiline="true"
    />
  );
}

export default InlineEditableContent;

import React, { useEffect, useRef } from "react";

interface InlineEditableContentProps {
  initialValue: string;
  onCommit: (next: string) => void;
  onCancel: () => void;
  variant?: "block" | "inline";
  className?: string;
  style?: React.CSSProperties;
}

export function InlineEditableContent(props: InlineEditableContentProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const {
    initialValue,
    onCommit,
    onCancel,
    variant = "block",
    className,
    style,
  } = props;

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

  if (variant === "inline") {
    return (
      <span
        ref={ref as unknown as React.RefObject<HTMLSpanElement>}
        contentEditable
        suppressContentEditableWarning
        onBlur={finish}
        onKeyDown={onKeyDown}
        className={`whitespace-pre-wrap break-words outline-none ${className ?? ""}`}
        style={style}
        role="textbox"
        aria-multiline="true"
      />
    );
  }

  return (
    <div
      ref={ref}
      contentEditable
      suppressContentEditableWarning
      onBlur={finish}
      onKeyDown={onKeyDown}
      className={`md:text-base whitespace-pre-wrap break-words outline-none ml-2 pt-2 ${className ?? ""}`}
      style={{ minHeight: 0, ...style }}
      role="textbox"
      aria-multiline="true"
    />
  );
}

export default InlineEditableContent;

import * as React from "react";

import { cn } from "@/lib/utils";

// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    const textAreaRef = React.useRef<HTMLTextAreaElement>(null);
    React.useImperativeHandle(ref, () => textAreaRef.current!);

    React.useLayoutEffect(() => {
      if (textAreaRef.current) {
        textAreaRef.current.style.height = "auto";
        const scrollHeight = textAreaRef.current.scrollHeight;
        if (scrollHeight > 300) {
          textAreaRef.current.style.height = "300px";
          textAreaRef.current.style.overflowY = "auto";
        } else {
          textAreaRef.current.style.height = scrollHeight + "px";
          textAreaRef.current.style.overflowY = "hidden";
        }
      }
    }, [props.value]);

    return (
      <textarea
        data-slot="textarea"
        className={cn(
          "file:text-foreground placeholder:text-muted-foreground selection:bg-primary selection:text-primary-foreground dark:bg-input/30 border-input flex w-full min-w-0 rounded-xs border bg-transparent px-3 py-2 min-h-9 text-base shadow-xs transition-[color,box-shadow] outline-none file:inline-flex file:h-auto file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          "focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]",
          "aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
          "resize-none",
          className,
        )}
        ref={textAreaRef}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };

import { decodeEscapedText } from "@/lib/utils";
import { HandIcon, MegaphoneIcon, SpeechIcon } from "lucide-react";
import { LogEntryMode } from "@/types/log.type";

export interface LogEntryBubbleProps {
  text: string;
  mode?: LogEntryMode;
}

export function LogEntryBubble({ text, mode }: LogEntryBubbleProps) {
  if (mode === LogEntryMode.SAY) {
    return (
      <div className="flex items-center rounded-xs border-accent-foreground/50 py-1 bg-blue-300/15">
        <SpeechIcon className="inline w-4 h-4 mr-2 text-muted-foreground ml-2 shrink-0" />
        <p className="inline whitespace-pre-wrap break-words mr-1">
          {decodeEscapedText(text)}
        </p>
      </div>
    );
  }

  if (mode === LogEntryMode.DO) {
    return (
      <div className="flex items-center rounded-xs border-accent-foreground/50 py-1 bg-amber-300/15">
        <HandIcon className="inline w-4 h-4 mr-2 text-muted-foreground ml-2 shrink-0" />
        <p className="inline whitespace-pre-wrap break-words mr-1">
          {decodeEscapedText(text)}
        </p>
      </div>
    );
  }

  if (mode === LogEntryMode.DIRECT) {
    return (
      <div className="flex items-center rounded-xs border-accent-foreground/50 py-1 bg-green-300/15">
        <MegaphoneIcon className="inline w-4 h-4 mr-2 text-muted-foreground ml-2 shrink-0" />
        <p className="inline whitespace-pre-wrap break-words mr-1">
          {decodeEscapedText(text)}
        </p>
      </div>
    );
  }

  return (
    <div className="flex items-center ml-2">
      <p className="inline whitespace-pre-wrap break-words">
        {decodeEscapedText(text)}
      </p>
    </div>
  );
}

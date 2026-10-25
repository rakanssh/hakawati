import { flushSync } from "react-dom";
import { enqueueLocalOperation } from "@/lib/local-write-queue";

export const pendingAutoSaves = new Set<() => Promise<void>>();

/** Native window close and updater install do not run browser beforeunload. */
export async function flushPendingAutoSaves(): Promise<void> {
  // Inline editors commit on blur; publish those React changes before saving.
  flushSync(() => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
  });
  await Promise.all(Array.from(pendingAutoSaves, (flush) => flush()));
  // Log edits and other immediate saves also use this existing write queue.
  await enqueueLocalOperation(async () => undefined);
}

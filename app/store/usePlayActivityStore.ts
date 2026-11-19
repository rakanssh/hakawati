import { create } from "zustand";

/** Work on the open tale that must not overlap: the narrator's turn, saves, and Hakawati's edits. */
interface PlayActivity {
  narrating: number;
  saving: number;
  assistantWriting: number;
}

export const usePlayActivityStore = create<PlayActivity>(() => ({
  narrating: 0,
  saving: 0,
  assistantWriting: 0,
}));

export type PlayActivityKind = keyof PlayActivity;

export function beginPlayActivity(kind: PlayActivityKind): () => void {
  usePlayActivityStore.setState((state) => ({ [kind]: state[kind] + 1 }));
  let ended = false;
  return () => {
    if (ended) return;
    ended = true;
    usePlayActivityStore.setState((state) => ({
      [kind]: Math.max(0, state[kind] - 1),
    }));
  };
}

function nextChange(signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Request cancelled.", "AbortError"));
      return;
    }
    const stop = () => {
      unsubscribe();
      signal?.removeEventListener("abort", abort);
    };
    const abort = () => {
      stop();
      reject(new DOMException("Request cancelled.", "AbortError"));
    };
    const unsubscribe = usePlayActivityStore.subscribe(() => {
      stop();
      resolve();
    });
    signal?.addEventListener("abort", abort, { once: true });
  });
}

/** Starts `kind` now if none of `blockers` is running. */
export function tryBeginPlayActivity(
  kind: PlayActivityKind,
  blockers: PlayActivityKind[],
): (() => void) | null {
  const state = usePlayActivityStore.getState();
  return blockers.some((blocker) => state[blocker] > 0)
    ? null
    : beginPlayActivity(kind);
}

/**
 * Waits until none of `blockers` is running, then starts `kind` in the same step,
 * so two kinds that block each other can never both start.
 */
export async function claimPlayActivity(
  kind: PlayActivityKind,
  blockers: PlayActivityKind[],
  signal?: AbortSignal,
): Promise<() => void> {
  for (;;) {
    const end = tryBeginPlayActivity(kind, blockers);
    if (end) return end;
    await nextChange(signal);
  }
}

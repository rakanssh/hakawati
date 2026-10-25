import { useLayoutEffect, type RefObject } from "react";

export function useLatestPassageRail(
  storyRef: RefObject<HTMLElement | null>,
  railRef: RefObject<HTMLElement | null>,
  active: boolean,
) {
  useLayoutEffect(() => {
    const story = storyRef.current;
    const rail = railRef.current;
    if (!active || !story || !rail) return;

    let frame = 0;
    const place = () => {
      frame = 0;
      const passage = story.querySelectorAll("[data-story-highlight]");
      // The passage can start with a space that wraps at the end of the previous line.
      const start =
        story.querySelector("[data-story-latest-lead]") ?? passage[0];
      const first = start?.getClientRects()[0];
      const lastRects = passage[passage.length - 1]?.getClientRects();
      const last = lastRects?.[lastRects.length - 1];
      if (!first || !last) {
        rail.hidden = true;
        return;
      }
      const origin = story.getBoundingClientRect().top;
      rail.style.top = `${first.top - origin}px`;
      rail.style.height = `${last.bottom - first.top}px`;
      rail.hidden = false;
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(place);
    };

    place();
    const mutations = new MutationObserver(schedule);
    mutations.observe(story, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    const resizes =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(schedule)
        : null;
    resizes?.observe(story);
    document.fonts?.addEventListener("loadingdone", schedule);
    return () => {
      cancelAnimationFrame(frame);
      mutations.disconnect();
      resizes?.disconnect();
      document.fonts?.removeEventListener("loadingdone", schedule);
    };
  }, [storyRef, railRef, active]);
}

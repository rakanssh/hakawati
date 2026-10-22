import { useCallback, useRef, useState, type RefObject } from "react";

/** How far the reader scrolls one way before the bar follows, so a wobbly finger doesn't flicker it. */
const SLACK_PX = 12;

/**
 * Tucks a bar away while the reader scrolls on toward newer text, and brings it
 * back when they scroll back or reach the top. Call `onScroll` on every scroll
 * of the container.
 */
export function useHideOnScroll(scrollRef: RefObject<HTMLElement | null>) {
  const [hidden, setHidden] = useState(false);
  // Where the reader's scrolling is counted from.
  const anchorRef = useRef(0);
  const layoutRef = useRef({ scrollHeight: 0, clientHeight: 0 });

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollTop, scrollHeight, clientHeight } = el;
    const layout = layoutRef.current;
    layoutRef.current = { scrollHeight, clientHeight };

    // Moves the layout made don't count: the view resizing (the keyboard
    // opening or closing) or older text loading in above. New text arriving at
    // the end does, since following it is reading on.
    const atEnd = scrollHeight - clientHeight - scrollTop <= SLACK_PX;
    if (
      clientHeight !== layout.clientHeight ||
      (scrollHeight !== layout.scrollHeight && !atEnd)
    ) {
      anchorRef.current = scrollTop;
      return;
    }

    const moved = scrollTop - anchorRef.current;
    if (scrollTop <= SLACK_PX || moved < -SLACK_PX) setHidden(false);
    else if (moved > SLACK_PX) setHidden(true);
    else return;
    anchorRef.current = scrollTop;
  }, [scrollRef]);

  return { hidden, onScroll };
}

/**
 * A sideways-scrolling bar says it scrolls: an edge fades where more tabs hide.
 * One pixel of slack absorbs sub-pixel widths (zoom, odd device ratios).
 */
export function scrollHints(scrollLeft: number, clientWidth: number, scrollWidth: number): { start: boolean; end: boolean } {
  const overflow = scrollWidth - clientWidth;
  if (!(overflow > 1)) return { start: false, end: false };
  return {
    start: scrollLeft > 1,
    end: scrollLeft < overflow - 1,
  };
}

/** Horizontal offset that brings a tab fully into view, or null when it already is. */
export function scrollOffsetToReveal(
  itemLeft: number,
  itemWidth: number,
  scrollLeft: number,
  clientWidth: number,
  edge = 24,
): number | null {
  const start = Math.max(0, itemLeft - edge);
  if (start < scrollLeft) return start;
  const end = itemLeft + itemWidth + edge;
  if (end > scrollLeft + clientWidth) return end - clientWidth;
  return null;
}

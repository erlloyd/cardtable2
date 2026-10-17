const MIN_THUMB = 32;

export interface ScrollMetrics {
  clientWidth: number;
  scrollWidth: number;
  scrollLeft: number;
}

export function thumbGeometry({
  clientWidth,
  scrollWidth,
  scrollLeft,
}: ScrollMetrics) {
  const maxScroll = Math.max(0, scrollWidth - clientWidth);
  const width = Math.min(
    clientWidth,
    Math.max(MIN_THUMB, (clientWidth * clientWidth) / (scrollWidth || 1)),
  );
  const travel = clientWidth - width;
  const left = maxScroll === 0 ? 0 : (scrollLeft / maxScroll) * travel;
  return { width, left, travel, maxScroll };
}

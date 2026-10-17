import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { thumbGeometry } from './peekScrollMath';
import type { ScrollMetrics } from './peekScrollMath';

function measure(row: HTMLDivElement): ScrollMetrics {
  return {
    clientWidth: row.clientWidth,
    scrollWidth: row.scrollWidth,
    scrollLeft: row.scrollLeft,
  };
}

interface PeekScrollbarProps {
  rowRef: RefObject<HTMLDivElement | null>;
}

/**
 * DOM scroll bar for the peek row. The cards capture touch for drag-reorder,
 * and mobile browsers hide native overlay scrollbars, so touch users need
 * this handle.
 */
export function PeekScrollbar({ rowRef }: PeekScrollbarProps) {
  const [metrics, setMetrics] = useState<ScrollMetrics | null>(null);

  useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    const update = () => setMetrics(measure(row));
    update();
    row.addEventListener('scroll', update);
    window.addEventListener('resize', update);
    return () => {
      row.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [rowRef]);

  if (!metrics || metrics.scrollWidth <= metrics.clientWidth) return null;

  const { width, left, travel, maxScroll } = thumbGeometry(metrics);

  const startThumbDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const row = rowRef.current;
    if (!row || travel === 0) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startScroll = row.scrollLeft;
    const handleMove = (ev: PointerEvent) => {
      row.scrollLeft =
        startScroll + ((ev.clientX - startX) / travel) * maxScroll;
    };
    const stop = () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
  };

  const tapTrack = (e: React.PointerEvent<HTMLDivElement>) => {
    const row = rowRef.current;
    if (!row || travel === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const target = (e.clientX - rect.left - width / 2) / travel;
    row.scrollLeft = Math.max(0, Math.min(1, target)) * maxScroll;
  };

  return (
    <div
      className="peek-scrollbar"
      data-testid="peek-scrollbar"
      onPointerDown={tapTrack}
    >
      <div className="peek-scrollbar-track">
        <div
          className="peek-scrollbar-thumb"
          data-testid="peek-scrollbar-thumb"
          style={{ width, transform: `translateX(${left}px)` }}
          onPointerDown={startThumbDrag}
        />
      </div>
    </div>
  );
}

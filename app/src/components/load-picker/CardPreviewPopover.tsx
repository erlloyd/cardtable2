import { useEffect, useState } from 'react';
import type { Card, GameAssets } from '@cardtable2/shared';
import { CardPreview } from '../CardPreview';
import {
  getPreviewDimensions,
  DEFAULT_PREVIEW_SIZE,
} from '../../constants/previewSizes';

/**
 * Estimated preview width used for off-viewport flipping. We don't know
 * the exact rendered width until `CardPreview` lays out (the image may
 * rotate for landscape cards), but the medium-portrait preset is a safe
 * upper-bound for the row-icon affordance. Slight over-estimate is
 * harmless; under-estimate would clip the right edge.
 */
const PREVIEW_WIDTH_HINT = getPreviewDimensions(DEFAULT_PREVIEW_SIZE).width;

/** Padding from the edge of the viewport when flipping. */
const VIEWPORT_PADDING = 12;

/** Horizontal gap between the anchor and the preview. */
const ANCHOR_GAP = 12;

interface CardPreviewPopoverProps {
  /** Card to preview. */
  card: Card;
  /** Card code (for back-image resolution; we only ever show face here). */
  cardCode: string;
  /** Game assets — passed through to `CardPreview` for orientation lookup. */
  gameAssets: GameAssets;
  /** The element the popover is anchored to (the eye icon). */
  anchorEl: HTMLElement;
  /** Close handler — fired when the host wants to dismiss. */
  onClose: () => void;
}

/**
 * Desktop hover-mode preview for the load picker (ct-87o).
 *
 * Computes a viewport-relative `(x, y)` from the anchor element's bounding
 * rect, then defers to `CardPreview` (`mode='hover'`) for the actual
 * rendering — same component the table-side hover preview uses, so the
 * picker preview matches the table preview's visuals (rotation,
 * dimensions, gray-while-loading box).
 *
 * Position strategy: place to the right of the anchor when there's room;
 * flip to the left otherwise. Vertically: align the preview's top with
 * the anchor's middle, but clamp to keep the preview on-screen. We
 * recompute on every scroll/resize while open so the popover stays
 * pinned to the moving anchor (the modal's item list is scrollable).
 */
export function CardPreviewPopover({
  card,
  cardCode,
  gameAssets,
  anchorEl,
  onClose,
}: CardPreviewPopoverProps) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(
    null,
  );

  useEffect(() => {
    function recompute() {
      const rect = anchorEl.getBoundingClientRect();
      const viewportW = window.innerWidth;
      const viewportH = window.innerHeight;

      // Default: place to the right of the anchor.
      let x = rect.right + ANCHOR_GAP;
      // Flip if it would overflow the right edge.
      if (x + PREVIEW_WIDTH_HINT + VIEWPORT_PADDING > viewportW) {
        x = rect.left - ANCHOR_GAP - PREVIEW_WIDTH_HINT;
        // If flipping also overflows the left, clamp into the viewport.
        if (x < VIEWPORT_PADDING) x = VIEWPORT_PADDING;
      }

      // Vertical: align top of preview slightly above the anchor's center.
      // The exact preview height varies by card orientation; clamp at the
      // bottom so it never runs off-screen (the top clamp is just the
      // viewport edge).
      let y = rect.top + rect.height / 2 - 60;
      if (y < VIEWPORT_PADDING) y = VIEWPORT_PADDING;
      // 600 is a generous height upper-bound (medium portrait = 392, large
      // portrait = 504, plus shadow allowance). Clamp keeps the preview's
      // top inside the viewport when the icon is near the bottom.
      const maxY = viewportH - 600;
      if (y > maxY) y = Math.max(VIEWPORT_PADDING, maxY);

      setPosition({ x, y });
    }
    recompute();

    // Reposition on scroll (the picker's item list is scrollable) or
    // resize. `true` capture so we catch scroll on the inner list, not
    // just window scroll.
    window.addEventListener('scroll', recompute, true);
    window.addEventListener('resize', recompute);
    return () => {
      window.removeEventListener('scroll', recompute, true);
      window.removeEventListener('resize', recompute);
    };
  }, [anchorEl]);

  if (!position) return null;

  return (
    <CardPreview
      card={card}
      cardCode={cardCode}
      faceUp={true}
      gameAssets={gameAssets}
      mode="hover"
      position={position}
      onClose={onClose}
    />
  );
}

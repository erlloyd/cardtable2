import type { Position, AttachmentLayout } from '@cardtable2/shared';
import { STACK_WIDTH, STACK_HEIGHT } from '../renderer/objects/stack/constants';

/**
 * Compute world positions for attached cards fanning out from a parent.
 *
 * @param parentPos - Parent card's world position
 * @param attachmentCount - Number of attached cards
 * @param layout - Attachment layout configuration
 * @returns Array of world positions, one per attached card (index 0 = first attachment)
 */
export function computeAttachmentPositions(
  parentPos: Position,
  attachmentCount: number,
  layout: AttachmentLayout,
): Position[] {
  if (attachmentCount === 0) return [];

  const {
    direction,
    revealFraction: rawReveal,
    maxBeforeCompress = 5,
  } = layout;

  // Clamp revealFraction to [0, 1] to guard against invalid game definitions
  const revealFraction = Math.max(0, Math.min(1, rawReveal));

  // Progressive compression: reduce reveal fraction when exceeding max
  let effectiveReveal = revealFraction;
  if (attachmentCount > maxBeforeCompress) {
    // Scale down so total fan length stays bounded at ~maxBeforeCompress * revealFraction * dimension
    effectiveReveal = (revealFraction * maxBeforeCompress) / attachmentCount;
  }

  // Determine offset per card based on direction.
  // Corner directions use a symmetric offset reusing effectiveReveal on both axes.
  const dx = STACK_WIDTH * effectiveReveal;
  const dy = STACK_HEIGHT * effectiveReveal;
  let baseDx = 0;
  let baseDy = 0;
  switch (direction) {
    case 'top':
      baseDy = -dy;
      break;
    case 'bottom':
      baseDy = dy;
      break;
    case 'left':
      baseDx = -dx;
      break;
    case 'right':
      baseDx = dx;
      break;
    case 'top-left':
      baseDx = -dx;
      baseDy = -dy;
      break;
    case 'top-right':
      baseDx = dx;
      baseDy = -dy;
      break;
    case 'bottom-left':
      baseDx = -dx;
      baseDy = dy;
      break;
    case 'bottom-right':
      baseDx = dx;
      baseDy = dy;
      break;
  }

  // Apply parent rotation to offset vector
  const angleRad = (parentPos.r * Math.PI) / 180;
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const rotatedDx = baseDx * cos - baseDy * sin;
  const rotatedDy = baseDx * sin + baseDy * cos;

  const positions: Position[] = [];
  for (let i = 0; i < attachmentCount; i++) {
    positions.push({
      x: parentPos.x + rotatedDx * (i + 1),
      y: parentPos.y + rotatedDy * (i + 1),
      r: parentPos.r, // Attachments inherit parent rotation
    });
  }

  return positions;
}

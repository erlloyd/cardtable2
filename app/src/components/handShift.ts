/**
 * Compute how far a card at `index` should shift during a drag-reorder.
 *
 * When `toSlot` is set and differs from `fromSlot`, cards between them shift
 * to visually move the empty slot from `fromSlot` to `toSlot`.
 */
export function computeShiftOffset(
  index: number,
  fromSlot: number,
  toSlot: number,
  slotWidth: number,
): number {
  if (toSlot === fromSlot) return 0;
  if (fromSlot < toSlot) {
    if (index > fromSlot && index <= toSlot) return -slotWidth;
  } else {
    if (index >= toSlot && index < fromSlot) return slotWidth;
  }
  return 0;
}

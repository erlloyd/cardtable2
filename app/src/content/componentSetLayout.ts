// ============================================================================
// Row-Based Layout for Component Sets
// ============================================================================

const HORIZONTAL_PADDING = 20;
const ROW_GAP = 30;

/** An item to be positioned in the layout */
export interface LayoutItem {
  width: number;
  height: number;
  row?: number; // 0-based row hint. Default: 0
}

/** A calculated position for a layout item */
export interface LayoutPosition {
  x: number;
  y: number;
}

/**
 * Calculate positions for a list of items using row-based layout.
 *
 * - Items with the same `row` are placed side-by-side horizontally
 * - Rows are stacked vertically, spaced by the tallest item in the previous row
 * - Items without `row` default to row 0
 * - Empty rows (gaps in row numbers) don't add vertical space
 * - Output order matches input order (positions[i] corresponds to items[i])
 */
export function calculateRowLayout(
  items: LayoutItem[],
  origin: { x: number; y: number } = { x: 0, y: 0 },
): LayoutPosition[] {
  if (items.length === 0) return [];

  // Group items by row, preserving original indices
  const rowGroups = new Map<
    number,
    Array<{ index: number; item: LayoutItem }>
  >();

  for (let i = 0; i < items.length; i++) {
    const row = items[i].row ?? 0;
    if (!rowGroups.has(row)) {
      rowGroups.set(row, []);
    }
    rowGroups.get(row)!.push({ index: i, item: items[i] });
  }

  // Sort row keys to process top-to-bottom
  const sortedRows = [...rowGroups.keys()].sort((a, b) => a - b);

  // Calculate positions
  const positions: LayoutPosition[] = Array.from<LayoutPosition>({
    length: items.length,
  });
  let currentY = origin.y;

  for (const rowKey of sortedRows) {
    const rowItems = rowGroups.get(rowKey)!;
    let currentX = origin.x;
    let maxHeight = 0;

    for (const { index, item } of rowItems) {
      positions[index] = { x: currentX, y: currentY };
      currentX += item.width + HORIZONTAL_PADDING;
      maxHeight = Math.max(maxHeight, item.height);
    }

    currentY += maxHeight + ROW_GAP;
  }

  return positions;
}

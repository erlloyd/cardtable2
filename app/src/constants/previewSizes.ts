/**
 * Preview size presets for card image previews
 *
 * Dimensions are specified for portrait orientation.
 * Landscape cards swap width/height values.
 */

export interface PreviewDimensions {
  width: number;
  height: number;
}

export const PREVIEW_SIZES: Record<string, PreviewDimensions> = {
  small: {
    width: 200,
    height: 280,
  },
  medium: {
    width: 280,
    height: 392,
  },
  large: {
    width: 360,
    height: 504,
  },
};

/**
 * Default preview size preset
 */
export const DEFAULT_PREVIEW_SIZE = 'medium';

/**
 * Default hover delay in milliseconds
 */
export const DEFAULT_HOVER_DELAY = 300;

/**
 * Default rotation enabled state
 */
export const DEFAULT_ROTATION_ENABLED = true;

/**
 * Get preview dimensions for a given size preset
 *
 * @param size - Size preset ('small', 'medium', 'large') or 'custom'
 * @param customDimensions - Custom dimensions when size is 'custom'
 * @returns Preview dimensions (portrait reference)
 */
export function getPreviewDimensions(
  size: string,
  customDimensions?: PreviewDimensions,
): PreviewDimensions {
  if (size === 'custom' && customDimensions) {
    return customDimensions;
  }

  return PREVIEW_SIZES[size] || PREVIEW_SIZES[DEFAULT_PREVIEW_SIZE];
}

/**
 * Calculate landscape dimensions by swapping width/height
 *
 * @param dimensions - Portrait dimensions
 * @returns Landscape dimensions (swapped)
 */
export function getLandscapeDimensions(
  dimensions: PreviewDimensions,
): PreviewDimensions {
  return {
    width: dimensions.height,
    height: dimensions.width,
  };
}

/**
 * Error IDs for Sentry tracking and debugging
 *
 * Grouped by feature/module for easy tracking.
 * Format: <MODULE>_<ERROR_TYPE>_<SPECIFIC_CASE>
 *
 * Usage:
 * ```typescript
 * import { ANIM_NOT_INIT } from '@/constants/errorIds';
 *
 * console.error('[AnimationManager] Not initialized', {
 *   errorId: ANIM_NOT_INIT,
 *   visualId,
 * });
 * ```
 */

// Animation errors
export const ANIM_NOT_INIT = 'ANIM_NOT_INIT';
export const ANIM_VISUAL_NOT_FOUND = 'ANIM_VISUAL_NOT_FOUND';
export const ANIM_TICKER_CRITICAL = 'ANIM_TICKER_CRITICAL';
export const ANIM_UPDATE_FAILED = 'ANIM_UPDATE_FAILED';
export const ANIM_CHILD_NOT_FOUND = 'ANIM_CHILD_NOT_FOUND';
export const ANIM_CHILD_WRONG_TYPE = 'ANIM_CHILD_WRONG_TYPE';
export const ANIM_NO_UPDATER = 'ANIM_NO_UPDATER';
export const ANIM_TIMEOUT = 'ANIM_TIMEOUT';

// Shuffle errors
export const SHUFFLE_STACK_NOT_FOUND = 'SHUFFLE_STACK_NOT_FOUND';
export const SHUFFLE_INVALID_TYPE = 'SHUFFLE_INVALID_TYPE';
export const SHUFFLE_INSUFFICIENT_CARDS = 'SHUFFLE_INSUFFICIENT_CARDS';
export const SHUFFLE_GHOST_CREATE_FAILED = 'SHUFFLE_GHOST_CREATE_FAILED';
export const SHUFFLE_ANIM_NOT_FOUND = 'SHUFFLE_ANIM_NOT_FOUND';
export const SHUFFLE_DETECT_INVALID_ARRAY = 'SHUFFLE_DETECT_INVALID_ARRAY';
export const SHUFFLE_DETECT_FAILED = 'SHUFFLE_DETECT_FAILED';

// Object update errors
export const FLIP_MIDPOINT_FAILED = 'FLIP_MIDPOINT_FAILED';
export const FLIP_COMPLETE_FAILED = 'FLIP_COMPLETE_FAILED';
export const SHUFFLE_COMPLETE_FAILED = 'SHUFFLE_COMPLETE_FAILED';

// Texture loading errors
export const TEXTURE_FETCH_FAILED = 'TEXTURE_FETCH_FAILED';
export const TEXTURE_DECODE_FAILED = 'TEXTURE_DECODE_FAILED';
export const TEXTURE_CREATE_FAILED = 'TEXTURE_CREATE_FAILED';
export const TEXTURE_LOAD_FAILED = 'TEXTURE_LOAD_FAILED';

// Card image errors
export const CARD_IMAGE_NOT_FOUND = 'CARD_IMAGE_NOT_FOUND';
export const CARD_IMAGE_NO_FACE = 'CARD_IMAGE_NO_FACE';
export const CARD_IMAGE_NO_BACK = 'CARD_IMAGE_NO_BACK';

// Awareness errors
export const AWARENESS_UPDATE_FAILED = 'AWARENESS_UPDATE_FAILED';
export const AWARENESS_RENDER_FAILED = 'AWARENESS_RENDER_FAILED';
export const AWARENESS_CLEAR_FAILED = 'AWARENESS_CLEAR_FAILED';

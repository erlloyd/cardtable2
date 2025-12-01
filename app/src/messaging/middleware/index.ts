import type { Middleware } from '../MessageHandlerRegistry';
import { DEBUG, MESSAGE_BUS_SKIP_TYPES } from '../../utils/debug';

/**
 * Logging middleware - logs all messages being handled
 *
 * Controlled by DEBUG.MESSAGE_BUS_VERBOSE flag.
 * High-frequency messages (pointer-move, cursor-position) are always skipped.
 *
 * @example
 * ```typescript
 * registry.use(loggingMiddleware);
 * // Logs: "[MessageBus] Handling: init" (only if DEBUG.MESSAGE_BUS_VERBOSE is true)
 * ```
 */
export const loggingMiddleware: Middleware<{ type: string }, unknown> = async (
  message,
  _context,
  next,
) => {
  // Skip logging high-frequency noisy messages
  if (!MESSAGE_BUS_SKIP_TYPES.has(message.type) && DEBUG.MESSAGE_BUS_VERBOSE) {
    console.log(`[MessageBus] Handling: ${message.type}`);
  }
  await next();
};

/**
 * Performance middleware - tracks and warns about slow message handlers
 *
 * Logs a warning if a handler takes more than 10ms to execute.
 * Controlled by DEBUG.PERFORMANCE flag.
 * Useful for identifying performance bottlenecks.
 *
 * @example
 * ```typescript
 * registry.use(performanceMiddleware);
 * // Logs: "[MessageBus] Slow handler: sync-objects (23.45ms)"
 * ```
 */
export const performanceMiddleware: Middleware<
  { type: string },
  unknown
> = async (message, _context, next) => {
  if (!DEBUG.PERFORMANCE) {
    await next();
    return;
  }

  const start = performance.now();
  await next();
  const duration = performance.now() - start;

  if (duration > 10) {
    console.warn(
      `[MessageBus] Slow handler: ${message.type} (${duration.toFixed(2)}ms)`,
    );
  }
};

/**
 * Error handling middleware - catches and logs errors from handlers
 *
 * Prevents errors from propagating and crashing the message bus.
 * Logs the error and continues execution.
 *
 * @example
 * ```typescript
 * registry.use(errorHandlingMiddleware);
 * // Logs: "[MessageBus] Handler error for init: Error: Failed to initialize"
 * ```
 */
export const errorHandlingMiddleware: Middleware<
  { type: string },
  unknown
> = async (message, _context, next) => {
  try {
    await next();
  } catch (error) {
    console.error(`[MessageBus] Handler error for ${message.type}:`, error);
    // Don't re-throw - log and continue
  }
};

/**
 * All middleware in recommended execution order
 *
 * 1. Error handling (outermost - catches all errors)
 * 2. Performance tracking
 * 3. Logging
 *
 * @example
 * ```typescript
 * allMiddleware.forEach(mw => registry.use(mw));
 * ```
 */
export const allMiddleware = [
  errorHandlingMiddleware,
  performanceMiddleware,
  loggingMiddleware,
];

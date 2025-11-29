import type { Middleware } from '../MessageHandlerRegistry';

/**
 * Logging middleware - logs all messages being handled
 *
 * @example
 * ```typescript
 * registry.use(loggingMiddleware);
 * // Logs: "[MessageBus] Handling: init"
 * ```
 */
export const loggingMiddleware: Middleware<{ type: string }, unknown> = async (
  message,
  _context,
  next,
) => {
  console.log(`[MessageBus] Handling: ${message.type}`);
  await next();
};

/**
 * Performance middleware - tracks and warns about slow message handlers
 *
 * Logs a warning if a handler takes more than 10ms to execute.
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

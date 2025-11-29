/**
 * Generic message handler with type-safe message routing
 */
export type MessageHandler<TMessage, TContext> = (
  message: TMessage,
  context: TContext,
) => void | Promise<void>;

/**
 * Middleware for cross-cutting concerns (logging, performance, error handling)
 */
export type Middleware<TMessage, TContext> = (
  message: TMessage,
  context: TContext,
  next: () => Promise<void>,
) => Promise<void>;

/**
 * Registry for message handlers with middleware support
 *
 * Provides type-safe message routing and middleware chain execution.
 * Replaces switch statement pattern with handler registration.
 *
 * @example
 * ```typescript
 * const registry = new MessageHandlerRegistry<MyMessage, MyContext>();
 *
 * // Register middleware
 * registry.use(loggingMiddleware);
 *
 * // Register handlers
 * registry.register('init', handleInit);
 * registry.register('resize', handleResize);
 *
 * // Handle message
 * await registry.handle(message, context);
 * ```
 */
export class MessageHandlerRegistry<
  TMessage extends { type: string },
  TContext,
> {
  // Type erasure: Store handlers with specific message types as generic handlers
  // This is safe because we only retrieve handlers based on message.type
  private handlers = new Map<string, MessageHandler<TMessage, TContext>>();
  private middleware: Middleware<TMessage, TContext>[] = [];

  /**
   * Register a handler for a specific message type
   *
   * @param type - The message type to handle
   * @param handler - The handler function
   */
  register<T extends TMessage['type']>(
    type: T,
    handler: MessageHandler<Extract<TMessage, { type: T }>, TContext>,
  ): void {
    if (this.handlers.has(type)) {
      console.warn(
        `[MessageHandlerRegistry] Handler for "${type}" already registered, overwriting`,
      );
    }
    // Type assertion: handler for specific message type is safe to store as general handler
    // because we only retrieve and call it with the correct message type based on the key
    this.handlers.set(type, handler as MessageHandler<TMessage, TContext>);
  }

  /**
   * Register middleware to be executed for all messages
   *
   * Middleware is executed in registration order.
   *
   * @param middleware - The middleware function
   */
  use(middleware: Middleware<TMessage, TContext>): void {
    this.middleware.push(middleware);
  }

  /**
   * Handle a message by routing to the appropriate handler
   *
   * Executes middleware chain, then delegates to registered handler.
   * Throws if no handler is registered for the message type.
   *
   * @param message - The message to handle
   * @param context - The context to pass to handlers
   */
  async handle(message: TMessage, context: TContext): Promise<void> {
    const handler = this.handlers.get(message.type);
    if (!handler) {
      throw new Error(
        `[MessageHandlerRegistry] No handler registered for message type: ${message.type}`,
      );
    }

    // Execute middleware chain
    let index = 0;
    const next = async (): Promise<void> => {
      if (index < this.middleware.length) {
        const middleware = this.middleware[index++];
        await middleware(message, context, next);
      } else {
        await handler(message, context);
      }
    };

    await next();
  }

  /**
   * Check if a handler is registered for a message type
   *
   * @param type - The message type to check
   * @returns True if a handler is registered
   */
  has(type: string): boolean {
    return this.handlers.has(type);
  }

  /**
   * Get all registered message types
   *
   * @returns Array of registered message types
   */
  getRegisteredTypes(): string[] {
    return Array.from(this.handlers.keys());
  }

  /**
   * Clear all handlers and middleware
   */
  clear(): void {
    this.handlers.clear();
    this.middleware = [];
  }
}

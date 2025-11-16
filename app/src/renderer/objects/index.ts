import { ObjectKind } from '@cardtable2/shared';
import type { ObjectBehaviors, EventHandlers } from './types';
import { StackBehaviors, StackEventHandlers } from './stack';
import { TokenBehaviors, TokenEventHandlers } from './token';
import { ZoneBehaviors, ZoneEventHandlers } from './zone';
import { MatBehaviors, MatEventHandlers } from './mat';
import { CounterBehaviors, CounterEventHandlers } from './counter';
import { defaultEventHandlers } from './base';

// Behavior registry
export const behaviorRegistry = new Map<ObjectKind, ObjectBehaviors>([
  [ObjectKind.Stack, StackBehaviors],
  [ObjectKind.Token, TokenBehaviors],
  [ObjectKind.Zone, ZoneBehaviors],
  [ObjectKind.Mat, MatBehaviors],
  [ObjectKind.Counter, CounterBehaviors],
]);

// Event handler registry (merges defaults with type-specific)
export const eventHandlerRegistry = new Map<ObjectKind, EventHandlers>([
  [ObjectKind.Stack, { ...defaultEventHandlers, ...StackEventHandlers }],
  [ObjectKind.Token, { ...defaultEventHandlers, ...TokenEventHandlers }],
  [ObjectKind.Zone, { ...defaultEventHandlers, ...ZoneEventHandlers }],
  [ObjectKind.Mat, { ...defaultEventHandlers, ...MatEventHandlers }],
  [ObjectKind.Counter, { ...defaultEventHandlers, ...CounterEventHandlers }],
]);

// Helper functions
export function getBehaviors(kind: ObjectKind): ObjectBehaviors {
  const behaviors = behaviorRegistry.get(kind);
  if (!behaviors) {
    throw new Error(`No behaviors registered for object kind: ${kind}`);
  }
  return behaviors;
}

export function getEventHandlers(kind: ObjectKind): EventHandlers {
  const handlers = eventHandlerRegistry.get(kind);
  if (!handlers) {
    throw new Error(`No event handlers registered for object kind: ${kind}`);
  }
  return handlers;
}

// Re-export types for convenience
export * from './types';

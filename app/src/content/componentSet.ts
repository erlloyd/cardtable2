import type {
  ComponentSet,
  ComponentSetStack,
  ComponentSetToken,
  ComponentSetCounter,
  ComponentSetMat,
  ComponentSetZone,
  GameAssets,
} from '@cardtable2/shared';
import {
  ObjectKind,
  type TableObject,
  type StackObject,
  type TokenObject,
  type Position,
  formatSortKey,
} from '@cardtable2/shared';
import { expandDeck, namespaceDeckCards } from './instantiate';

// ============================================================================
// Types
// ============================================================================

/** A ComponentSet with all deck references resolved to card arrays */
export interface ResolvedComponentSet {
  stacks?: ResolvedComponentSetStack[];
  tokens?: ComponentSetToken[];
  counters?: ComponentSetCounter[];
  mats?: ComponentSetMat[];
  zones?: ComponentSetZone[];
}

/** A stack with cards resolved (deck expanded, cards populated) */
export interface ResolvedComponentSetStack {
  label: string;
  faceUp: boolean;
  cards: string[];
  row?: number;
}

// ============================================================================
// Resolution — expand deck refs, validate refs
// ============================================================================

/**
 * Resolve a ComponentSet by expanding deck references into card arrays.
 * - Stacks with `cards`: passed through as-is
 * - Stacks with `deck`: expanded via expandDeck()
 * - If both present, `cards` takes precedence
 * - Stacks with invalid deck refs are warned and skipped
 * - All other object types are passed through unchanged
 */
export function resolveComponentSet(
  set: ComponentSet,
  gameAssets: GameAssets,
): ResolvedComponentSet {
  const resolved: ResolvedComponentSet = {};

  if (set.stacks) {
    resolved.stacks = [];
    for (const stack of set.stacks) {
      const resolvedStack = resolveStack(stack, gameAssets);
      if (resolvedStack) {
        resolved.stacks.push(resolvedStack);
      }
    }
  }

  if (set.tokens) {
    resolved.tokens = [...set.tokens];
  }

  if (set.counters) {
    resolved.counters = [...set.counters];
  }

  if (set.mats) {
    resolved.mats = [...set.mats];
  }

  if (set.zones) {
    resolved.zones = [...set.zones];
  }

  return resolved;
}

function resolveStack(
  stack: ComponentSetStack,
  gameAssets: GameAssets,
): ResolvedComponentSetStack | null {
  // cards takes precedence over deck
  if (stack.cards) {
    return {
      label: stack.label,
      faceUp: stack.faceUp,
      cards: [...stack.cards],
      row: stack.row,
    };
  }

  if (stack.deck) {
    try {
      const expandedCards = expandDeck(stack.deck, gameAssets);
      const cards = namespaceDeckCards(expandedCards, gameAssets);
      return {
        label: stack.label,
        faceUp: stack.faceUp,
        cards,
        row: stack.row,
      };
    } catch (error) {
      console.warn(
        `[ComponentSet] Failed to expand deck for stack "${stack.label}":`,
        error,
      );
      return null;
    }
  }

  // No cards or deck — empty stack
  return {
    label: stack.label,
    faceUp: stack.faceUp,
    cards: [],
    row: stack.row,
  };
}

// ============================================================================
// Instantiation — convert resolved set to TableObjects
// ============================================================================

let idCounter = 0;

function generateInstanceId(): string {
  idCounter++;
  return `cs-${Date.now()}-${idCounter}-${Math.random().toString(36).slice(2, 9)}`;
}

function createPosition(x: number, y: number, r: number = 0): Position {
  return { x, y, r };
}

function generateSortKey(index: number): string {
  return formatSortKey((index + 1) * 1000);
}

/**
 * Instantiate a resolved ComponentSet into TableObjects.
 * Generates UUID-style instance IDs for all objects.
 * Returns a map of instance ID to TableObject.
 */
export function instantiateComponentSet(
  set: ResolvedComponentSet,
  gameAssets: GameAssets,
): Map<string, TableObject> {
  const objects = new Map<string, TableObject>();
  let zIndex = 0;

  if (set.stacks) {
    for (const stack of set.stacks) {
      const obj = instantiateStackFromDef(stack, zIndex++);
      objects.set(generateInstanceId(), obj);
    }
  }

  if (set.tokens) {
    for (const token of set.tokens) {
      const obj = instantiateTokenFromDef(token, zIndex++);
      objects.set(generateInstanceId(), obj);
    }
  }

  if (set.counters) {
    for (const counter of set.counters) {
      const obj = instantiateCounterFromDef(counter, gameAssets, zIndex++);
      objects.set(generateInstanceId(), obj);
    }
  }

  if (set.mats) {
    for (const mat of set.mats) {
      const obj = instantiateMatFromDef(mat, zIndex++);
      objects.set(generateInstanceId(), obj);
    }
  }

  if (set.zones) {
    for (const zone of set.zones) {
      const obj = instantiateZoneFromDef(zone, zIndex++);
      objects.set(generateInstanceId(), obj);
    }
  }

  return objects;
}

// ============================================================================
// Per-type instantiation from Def types
// ============================================================================

function instantiateStackFromDef(
  stack: ResolvedComponentSetStack,
  zIndex: number,
): StackObject {
  return {
    _kind: ObjectKind.Stack,
    _containerId: null,
    _pos: createPosition(0, 0),
    _sortKey: generateSortKey(zIndex),
    _locked: false,
    _selectedBy: null,
    _meta: {},
    _cards: stack.cards,
    _faceUp: stack.faceUp,
  };
}

function instantiateTokenFromDef(
  token: ComponentSetToken,
  zIndex: number,
): TokenObject {
  return {
    _kind: ObjectKind.Token,
    _containerId: null,
    _pos: createPosition(0, 0),
    _sortKey: generateSortKey(zIndex),
    _locked: false,
    _selectedBy: null,
    _meta: { tokenRef: token.ref, label: token.label },
    _faceUp: true,
  };
}

function instantiateCounterFromDef(
  counter: ComponentSetCounter,
  gameAssets: GameAssets,
  zIndex: number,
): TableObject {
  const counterDef = gameAssets.counters[counter.ref];

  return {
    _kind: ObjectKind.Counter,
    _containerId: null,
    _pos: createPosition(0, 0),
    _sortKey: generateSortKey(zIndex),
    _locked: false,
    _selectedBy: null,
    _meta: {
      counterRef: counter.ref,
      label: counter.label ?? counterDef?.label,
      value: counter.value ?? counterDef?.start,
      min: counterDef?.min,
      max: counterDef?.max,
    },
  };
}

function instantiateMatFromDef(
  mat: ComponentSetMat,
  zIndex: number,
): TableObject {
  return {
    _kind: ObjectKind.Mat,
    _containerId: null,
    _pos: createPosition(0, 0),
    _sortKey: generateSortKey(zIndex - 100), // Mats typically at bottom
    _locked: false,
    _selectedBy: null,
    _meta: { matRef: mat.ref, label: mat.label },
  };
}

function instantiateZoneFromDef(
  zone: ComponentSetZone,
  zIndex: number,
): TableObject {
  const meta: Record<string, unknown> = {};

  if (zone.ref) {
    meta.zoneRef = zone.ref;
  }
  if (zone.label) {
    meta.label = zone.label;
  }
  if (zone.width !== undefined) {
    meta.width = zone.width;
  }
  if (zone.height !== undefined) {
    meta.height = zone.height;
  }

  return {
    _kind: ObjectKind.Zone,
    _containerId: null,
    _pos: createPosition(0, 0),
    _sortKey: generateSortKey(zIndex - 50), // Zones typically near bottom
    _locked: false,
    _selectedBy: null,
    _meta: meta,
  };
}

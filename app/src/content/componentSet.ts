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
import { calculateRowLayout, type LayoutItem } from './componentSetLayout';

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

// Default dimensions for layout spacing
const DEFAULT_STACK_SIZE: [number, number] = [180, 252];
const DEFAULT_TOKEN_SIZE: [number, number] = [64, 64];
const DEFAULT_COUNTER_SIZE: [number, number] = [64, 64];
const DEFAULT_MAT_SIZE: [number, number] = [400, 250];
const DEFAULT_ZONE_SIZE: [number, number] = [100, 140];

interface LayoutEntry {
  type: 'stack' | 'token' | 'counter' | 'mat' | 'zone';
  index: number; // Index within its type array
  row?: number;
}

/**
 * Instantiate a resolved ComponentSet into TableObjects.
 * Uses row-based layout to position objects.
 * Generates unique instance IDs for all objects.
 * Returns a map of instance ID to TableObject.
 */
export function instantiateComponentSet(
  set: ResolvedComponentSet,
  gameAssets: GameAssets,
): Map<string, TableObject> {
  // Build flat list of items for layout calculation
  const layoutItems: LayoutItem[] = [];
  const entries: LayoutEntry[] = [];

  if (set.stacks) {
    for (let i = 0; i < set.stacks.length; i++) {
      layoutItems.push({
        width: DEFAULT_STACK_SIZE[0],
        height: DEFAULT_STACK_SIZE[1],
        row: set.stacks[i].row,
      });
      entries.push({ type: 'stack', index: i, row: set.stacks[i].row });
    }
  }

  if (set.tokens) {
    for (let i = 0; i < set.tokens.length; i++) {
      layoutItems.push({
        width: DEFAULT_TOKEN_SIZE[0],
        height: DEFAULT_TOKEN_SIZE[1],
        row: set.tokens[i].row,
      });
      entries.push({ type: 'token', index: i, row: set.tokens[i].row });
    }
  }

  if (set.counters) {
    for (let i = 0; i < set.counters.length; i++) {
      layoutItems.push({
        width: DEFAULT_COUNTER_SIZE[0],
        height: DEFAULT_COUNTER_SIZE[1],
        row: set.counters[i].row,
      });
      entries.push({ type: 'counter', index: i, row: set.counters[i].row });
    }
  }

  if (set.mats) {
    for (let i = 0; i < set.mats.length; i++) {
      layoutItems.push({
        width: DEFAULT_MAT_SIZE[0],
        height: DEFAULT_MAT_SIZE[1],
        row: set.mats[i].row,
      });
      entries.push({ type: 'mat', index: i, row: set.mats[i].row });
    }
  }

  if (set.zones) {
    for (let i = 0; i < set.zones.length; i++) {
      const w = set.zones[i].width ?? DEFAULT_ZONE_SIZE[0];
      const h = set.zones[i].height ?? DEFAULT_ZONE_SIZE[1];
      layoutItems.push({ width: w, height: h, row: set.zones[i].row });
      entries.push({ type: 'zone', index: i, row: set.zones[i].row });
    }
  }

  // Calculate positions
  const positions = calculateRowLayout(layoutItems);

  // Create objects with positions
  const objects = new Map<string, TableObject>();

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    const pos = positions[i];
    let obj: TableObject;

    switch (entry.type) {
      case 'stack':
        obj = instantiateStackFromDef(
          set.stacks![entry.index],
          i,
          pos.x,
          pos.y,
        );
        break;
      case 'token':
        obj = instantiateTokenFromDef(
          set.tokens![entry.index],
          i,
          pos.x,
          pos.y,
        );
        break;
      case 'counter':
        obj = instantiateCounterFromDef(
          set.counters![entry.index],
          gameAssets,
          i,
          pos.x,
          pos.y,
        );
        break;
      case 'mat':
        obj = instantiateMatFromDef(set.mats![entry.index], i, pos.x, pos.y);
        break;
      case 'zone':
        obj = instantiateZoneFromDef(set.zones![entry.index], i, pos.x, pos.y);
        break;
    }

    objects.set(generateInstanceId(), obj);
  }

  return objects;
}

// ============================================================================
// Per-type instantiation from Def types
// ============================================================================

function instantiateStackFromDef(
  stack: ResolvedComponentSetStack,
  zIndex: number,
  x: number,
  y: number,
): StackObject {
  return {
    _kind: ObjectKind.Stack,
    _containerId: null,
    _pos: createPosition(x, y),
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
  x: number,
  y: number,
): TokenObject {
  return {
    _kind: ObjectKind.Token,
    _containerId: null,
    _pos: createPosition(x, y),
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
  x: number,
  y: number,
): TableObject {
  const counterDef = gameAssets.counters[counter.ref];

  return {
    _kind: ObjectKind.Counter,
    _containerId: null,
    _pos: createPosition(x, y),
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
  x: number,
  y: number,
): TableObject {
  return {
    _kind: ObjectKind.Mat,
    _containerId: null,
    _pos: createPosition(x, y),
    _sortKey: generateSortKey(zIndex - 100), // Mats typically at bottom
    _locked: false,
    _selectedBy: null,
    _meta: { matRef: mat.ref, label: mat.label },
  };
}

function instantiateZoneFromDef(
  zone: ComponentSetZone,
  zIndex: number,
  x: number,
  y: number,
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
    _pos: createPosition(x, y),
    _sortKey: generateSortKey(zIndex - 50), // Zones typically near bottom
    _locked: false,
    _selectedBy: null,
    _meta: meta,
  };
}

import type {
  Scenario,
  GameAssets,
  DeckDefinition,
  LayoutObject,
} from '@cardtable2/shared';
import {
  ObjectKind,
  type TableObject,
  type StackObject,
  type TokenObject,
  type Position,
} from '@cardtable2/shared';

// ============================================================================
// Deck Expansion
// ============================================================================

/**
 * Expand a deck definition into a list of card codes
 * Handles cardSets and individual cards with counts
 */
export function expandDeck(
  deckDef: DeckDefinition,
  content: GameAssets,
): string[] {
  const cards: string[] = [];

  // Add cards from cardSets
  if (deckDef.cardSets) {
    for (const setCode of deckDef.cardSets) {
      const cardSet = content.cardSets[setCode];
      if (!cardSet) {
        throw new Error(`Card set not found: ${setCode}`);
      }
      // CardSets can be arrays of objects {code, count} or legacy arrays of strings
      for (const item of cardSet) {
        if (typeof item === 'string') {
          // Legacy format: plain string
          cards.push(item);
        } else {
          // New format: object with code and optional count
          const count = item.count ?? 1;
          for (let i = 0; i < count; i++) {
            cards.push(item.code);
          }
        }
      }
    }
  }

  // Add individual cards with counts
  if (deckDef.cards) {
    for (const entry of deckDef.cards) {
      const count = entry.count ?? 1;
      for (let i = 0; i < count; i++) {
        cards.push(entry.code);
      }
    }
  }

  // Shuffle if requested
  if (deckDef.shuffle) {
    shuffleArray(cards);
  }

  return cards;
}

/**
 * Fisher-Yates shuffle algorithm
 */
function shuffleArray<T>(array: T[]): void {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
}

// ============================================================================
// Namespacing
// ============================================================================

/**
 * Create a namespaced card code: <packId>/<cardCode>
 * This allows cards from different packs to coexist without collision
 *
 * NOTE: Currently disabled (no-op) - we use plain card codes since gameId
 * in Y.Doc metadata disambiguates which game's assets to use.
 * May be re-enabled later if needed for multi-game scenarios.
 */
export function namespaceCardCode(_packId: string, cardCode: string): string {
  // No-op: Return plain card code
  return cardCode;
}

/**
 * Namespace all cards in a deck based on which pack defined them
 *
 * NOTE: Currently disabled (no-op) - we use plain card codes since gameId
 * in Y.Doc metadata disambiguates which game's assets to use.
 * May be re-enabled later if needed for multi-game scenarios.
 */
export function namespaceDeckCards(
  cards: string[],
  _content: GameAssets,
): string[] {
  // No-op: Return plain card codes
  return cards;
}

// ============================================================================
// Sort Key Generation
// ============================================================================

/**
 * Generate a fractional sort key for z-ordering
 * Uses base-36 encoding for compact representation
 */
export function generateSortKey(index: number): string {
  // Generate a key based on index
  // Use a large multiplier to leave room for insertions
  const value = (index + 1) * 1000;
  return value.toString(36);
}

// ============================================================================
// Layout Object Instantiation
// ============================================================================

/**
 * Create a Position object with default rotation
 */
function createPosition(x: number, y: number, r: number = 0): Position {
  return { x, y, r };
}

/**
 * Instantiate a stack object from a layout definition
 */
function instantiateStack(
  obj: LayoutObject,
  scenario: Scenario,
  content: GameAssets,
): StackObject {
  if (!obj.id) {
    throw new Error('Stack object missing required id');
  }

  let cards: string[] = [];

  // If deck is specified, expand it
  if (obj.deck) {
    const deckDef = scenario.decks?.[obj.deck];
    if (!deckDef) {
      throw new Error(`Deck not found: ${obj.deck}`);
    }
    const expandedCards = expandDeck(deckDef, content);
    cards = namespaceDeckCards(expandedCards, content);
  }

  return {
    _kind: ObjectKind.Stack,
    _containerId: null,
    _pos: createPosition(obj.pos.x, obj.pos.y),
    _sortKey: generateSortKey(obj.z ?? 0),
    _locked: false,
    _selectedBy: null,
    _meta: {},
    _cards: cards,
    _faceUp: obj.faceUp ?? false,
  };
}

/**
 * Instantiate a token object from a layout definition
 */
function instantiateToken(
  obj: LayoutObject,
  _content: GameAssets,
): TokenObject {
  if (!obj.ref) {
    throw new Error('Token object missing required ref');
  }

  return {
    _kind: ObjectKind.Token,
    _containerId: null,
    _pos: createPosition(obj.pos.x, obj.pos.y),
    _sortKey: generateSortKey(obj.z ?? 0),
    _locked: false,
    _selectedBy: null,
    _meta: { tokenRef: obj.ref, label: obj.label },
    _faceUp: true,
  };
}

/**
 * Instantiate a mat object from a layout definition
 */
function instantiateMat(obj: LayoutObject, _content: GameAssets): TableObject {
  if (!obj.ref) {
    throw new Error('Mat object missing required ref');
  }

  return {
    _kind: ObjectKind.Mat,
    _containerId: null,
    _pos: createPosition(obj.pos.x, obj.pos.y),
    _sortKey: generateSortKey(obj.z ?? -100), // Mats typically at bottom
    _locked: false,
    _selectedBy: null,
    _meta: { matRef: obj.ref, label: obj.label },
  };
}

/**
 * Instantiate a counter object from a layout definition
 */
function instantiateCounter(
  obj: LayoutObject,
  content: GameAssets,
): TableObject {
  if (!obj.ref) {
    throw new Error('Counter object missing required ref');
  }

  const counterDef = content.counters[obj.ref];
  if (!counterDef) {
    throw new Error(`Counter not found: ${obj.ref}`);
  }

  return {
    _kind: ObjectKind.Counter,
    _containerId: null,
    _pos: createPosition(obj.pos.x, obj.pos.y),
    _sortKey: generateSortKey(obj.z ?? 0),
    _locked: false,
    _selectedBy: null,
    _meta: {
      counterRef: obj.ref,
      label: obj.label ?? counterDef.label,
      value: counterDef.start,
      min: counterDef.min,
      max: counterDef.max,
    },
  };
}

/**
 * Instantiate a zone object from a layout definition
 */
function instantiateZone(obj: LayoutObject, _content: GameAssets): TableObject {
  // Zones can be defined inline (with id/width/height/label) or reference content (with ref)
  const meta: Record<string, unknown> = {};

  if (obj.ref) {
    meta.zoneRef = obj.ref;
  }

  if (obj.label) {
    meta.label = obj.label;
  }

  if (obj.width !== undefined) {
    meta.width = obj.width;
  }

  if (obj.height !== undefined) {
    meta.height = obj.height;
  }

  return {
    _kind: ObjectKind.Zone,
    _containerId: null,
    _pos: createPosition(obj.pos.x, obj.pos.y),
    _sortKey: generateSortKey(obj.z ?? -50), // Zones typically near bottom
    _locked: false,
    _selectedBy: null,
    _meta: meta,
  };
}

/**
 * Instantiate a single layout object
 */
function instantiateLayoutObject(
  obj: LayoutObject,
  scenario: Scenario,
  content: GameAssets,
): { id: string; object: TableObject } {
  let tableObject: TableObject;

  switch (obj.type) {
    case 'stack':
      tableObject = instantiateStack(obj, scenario, content);
      return { id: obj.id!, object: tableObject };

    case 'token':
      tableObject = instantiateToken(obj, content);
      // Generate ID from scenario + ref
      return { id: `${scenario.id}:token:${obj.ref}`, object: tableObject };

    case 'mat':
      tableObject = instantiateMat(obj, content);
      // Generate ID from scenario + ref
      return { id: `${scenario.id}:mat:${obj.ref}`, object: tableObject };

    case 'counter':
      tableObject = instantiateCounter(obj, content);
      // Generate ID from scenario + ref
      return { id: `${scenario.id}:counter:${obj.ref}`, object: tableObject };

    case 'zone':
      tableObject = instantiateZone(obj, content);
      // Zones can have explicit ID (inline) or ref (content reference)
      if (obj.id) {
        return { id: obj.id, object: tableObject };
      } else if (obj.ref) {
        return { id: `${scenario.id}:zone:${obj.ref}`, object: tableObject };
      } else {
        throw new Error('Zone object must have either id or ref');
      }

    default:
      throw new Error(`Unknown object type: ${String(obj.type)}`);
  }
}

/**
 * Instantiate all layout objects from a scenario
 * Returns a map of object ID to TableObject
 */
export function instantiateScenario(
  scenario: Scenario,
  content: GameAssets,
): Map<string, TableObject> {
  const objects = new Map<string, TableObject>();

  if (!scenario.layout?.objects) {
    return objects;
  }

  for (const layoutObj of scenario.layout.objects) {
    const { id, object } = instantiateLayoutObject(
      layoutObj,
      scenario,
      content,
    );
    objects.set(id, object);
  }

  return objects;
}

// Content System Types
// Matches ct-assets-v1 and ct-scenario-v1 JSON schemas

// ============================================================================
// Asset Pack Types (ct-assets@1)
// ============================================================================

export type CardSize =
  | 'standard' // 180x252px
  | 'bridge' // Narrower than standard
  | 'tarot' // Larger than standard
  | 'mini' // Small cards
  | 'jumbo' // Oversized cards
  | [number, number]; // Custom [width, height] in pixels

export type TokenSize =
  | 'small'
  | 'medium' // 64x64px
  | 'large'
  | [number, number]; // Custom [width, height] in pixels

export type MatSize =
  | 'small'
  | 'medium'
  | 'large'
  | 'playmat' // 1920x1080px
  | [number, number]; // Custom [width, height] in pixels

export interface CardType {
  back?: string; // Default card back image URL
  size?: CardSize; // Default size for this card type
}

export interface Card {
  type: string; // References a cardType key
  face: string; // Card face image URL
  back?: string; // Optional override of type's back image
  size?: CardSize; // Optional override of type's size
}

export interface Token {
  image: string; // Token image URL
  size?: TokenSize; // Defaults to 'medium' if omitted
}

export interface Counter {
  label: string; // Display label
  min: number; // Minimum value
  max: number; // Maximum value
  start: number; // Initial value
}

export interface Mat {
  image: string; // Mat image URL
  size?: MatSize; // Defaults to 'playmat' if omitted
}

export interface AssetPack {
  schema: 'ct-assets@1'; // Schema version identifier
  id: string; // Unique pack identifier
  name: string; // Human-readable pack name
  version: string; // Semantic version (e.g., "1.0.0")
  baseUrl?: string; // Optional base URL for resolving relative asset paths
  cardTypes?: Record<string, CardType>; // Card type definitions
  cards?: Record<string, Card>; // Card catalog (key is card code)
  cardSets?: Record<string, Array<string | CardSetEntry>>; // Named card sets (key is set code, value is array of card codes or {code, count} objects)
  tokens?: Record<string, Token>; // Token definitions (key is token code)
  counters?: Record<string, Counter>; // Counter definitions (key is counter code)
  mats?: Record<string, Mat>; // Mat definitions (key is mat code)
}

// ============================================================================
// Scenario Types (ct-scenario@1)
// ============================================================================

export interface CardSetEntry {
  code: string; // Card code from asset packs
  count?: number; // Number of copies (defaults to 1)
}

export interface DeckCardEntry {
  code: string; // Card code from asset packs
  count?: number; // Number of copies (defaults to 1)
}

export interface DeckDefinition {
  cardSets?: string[]; // Card set codes to include
  cards?: DeckCardEntry[]; // Individual cards to include
  shuffle?: boolean; // Whether to shuffle the deck (defaults to false)
}

export type LayoutObjectType = 'mat' | 'stack' | 'token' | 'counter' | 'zone';

export interface LayoutObject {
  type: LayoutObjectType; // Object type
  id?: string; // Required for type=stack (unique instance ID)
  ref?: string; // Optional for mat/token/counter/zone (references asset catalog code)
  label?: string; // Optional display label
  pos: {
    x: number; // X position
    y: number; // Y position
  };
  z?: number; // Z-order (typically negative for mats)
  faceUp?: boolean; // Whether stack is face-up (for type=stack)
  deck?: string; // Deck reference (for type=stack)
  width?: number; // Width for inline zone definitions
  height?: number; // Height for inline zone definitions
}

export interface Scenario {
  schema: 'ct-scenario@1'; // Schema version identifier
  id: string; // Unique scenario identifier
  name: string; // Human-readable scenario name
  version: string; // Semantic version (e.g., "1.0.0")
  packs: string[]; // Asset pack IDs required for this scenario
  decks?: Record<string, DeckDefinition>; // Named deck definitions
  layout?: {
    objects: LayoutObject[]; // Layout objects to instantiate
  };
}

// ============================================================================
// Game Assets (merged from all loaded packs)
// ============================================================================

export interface GameAssets {
  packs: AssetPack[]; // All loaded packs (in load order)
  cardTypes: Record<string, CardType>; // Merged card types
  cards: Record<string, Card>; // Merged cards
  cardSets: Record<string, Array<string | CardSetEntry>>; // Merged card sets
  tokens: Record<string, Token>; // Merged tokens
  counters: Record<string, Counter>; // Merged counters
  mats: Record<string, Mat>; // Merged mats
}

// ============================================================================
// Resolved Card (after applying type inheritance)
// ============================================================================

export interface ResolvedCard {
  code: string; // Card code
  type: string; // Card type
  face: string; // Absolute URL for face image
  back: string; // Absolute URL for back image (from type or override)
  size: CardSize; // Resolved size (from type, card override, or default)
}

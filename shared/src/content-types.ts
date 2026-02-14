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

export type CardOrientation = 'portrait' | 'landscape' | 'auto';

export interface CardType {
  back?: string; // Default card back image URL
  size?: CardSize; // Default size for this card type
  orientation?: CardOrientation; // Default orientation for this card type (defaults to 'portrait')
}

export interface Card {
  type: string; // References a cardType key
  face: string; // Card face image URL
  back?: string; // Optional override of type's back image
  size?: CardSize; // Optional override of type's size
  orientation?: CardOrientation; // Optional override of type's orientation (follows inheritance: card → cardType → 'portrait')
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

// ============================================================================
// On-Card Attachment Type Definitions
// ============================================================================

/**
 * Token type definition for on-card quantity badges
 * Images should be PNG with transparent background
 */
export interface TokenTypeDef {
  name: string; // Display name (e.g., "Threat")
  image: string; // URL to token image (PNG with transparency)
  size?: number; // Optional size override in pixels (defaults to 20)
}

/**
 * Status effect type definition - displayed as small landscape card images
 * Status cards typically show keyword effects like "Stunned", "Confused", etc.
 */
export interface StatusTypeDef {
  name: string; // Display name (e.g., "Stunned")
  image: string; // URL to status card image (typically landscape, PNG with transparency)
  width?: number; // Optional width in pixels (defaults to 48)
  height?: number; // Optional height in pixels (defaults to 12)
  countable?: boolean; // When true, supports stacking multiple counts (like tokens). Default: false (toggle on/off)
}

/**
 * Modifier stat type definition for stat change indicators
 */
export interface ModifierStatDef {
  code: string; // Short code (e.g., "THW", "ATK")
  name: string; // Full name (e.g., "Thwart", "Attack")
  positiveColor: number; // Color for positive modifiers (hex)
  negativeColor: number; // Color for negative modifiers (hex)
}

/**
 * Icon type definition for game-specific symbols
 * Images should be PNG with transparent background
 */
export interface IconTypeDef {
  name: string; // Display name (e.g., "Retaliate")
  image: string; // URL to icon image (PNG with transparency)
  size?: number; // Optional size override in pixels (defaults to 16)
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
  // On-card attachment type definitions
  tokenTypes?: Record<string, TokenTypeDef>; // Token types for on-card badges (key is token type code)
  statusTypes?: Record<string, StatusTypeDef>; // Status effect types (key is status type code)
  modifierStats?: Record<string, ModifierStatDef>; // Modifier stat types (key is stat code)
  iconTypes?: Record<string, IconTypeDef>; // Icon types (key is icon type code)
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
  // On-card attachment type definitions (merged)
  tokenTypes: Record<string, TokenTypeDef>; // Merged token types
  statusTypes: Record<string, StatusTypeDef>; // Merged status types
  modifierStats: Record<string, ModifierStatDef>; // Merged modifier stats
  iconTypes: Record<string, IconTypeDef>; // Merged icon types
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

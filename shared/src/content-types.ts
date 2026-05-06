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

/**
 * Plugin-declared rule mapping card metadata to a render orientation.
 *
 * The `match` object is a record of card field-name → expected-value;
 * a card matches the rule only when ALL keys match (AND semantics).
 * Match field names can be any field on the `Card` type — `type`, `typeCode`,
 * `setCode`, etc. — letting plugins classify orientation finely.
 *
 * Runtime walks `gameAssets.orientationRules` in declared order; the first rule
 * whose match-object satisfies the card returns its `orientation`. A rule with
 * `orientation: 'auto'` is treated as "no opinion" — the walk continues to the
 * next rule, matching the existing per-card 'auto' semantics.
 */
export interface OrientationRule {
  match: Record<string, string>; // Card field-name → expected-value (AND-ed)
  orientation: CardOrientation; // Resolved orientation (or 'auto' to skip)
}

export interface CardType {
  back?: string; // Default card back image URL
  size?: CardSize; // Default size for this card type
}

export interface Card {
  type: string; // References a cardType key
  face: string; // Card face image URL
  back?: string; // Optional override of type's back image
  size?: CardSize; // Optional override of type's size
  orientation?: CardOrientation; // Optional override of type's orientation (follows inheritance: card → cardType → 'portrait')
  setCode?: string; // Optional set/group identifier (e.g. "spider_man_nemesis") — used by deck import parsers
  typeCode?: string; // Optional card category (e.g. "obligation", "encounter", "ally") — used by deck import parsers
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

// ============================================================================
// Card-on-Card Attachment Layout Configuration
// ============================================================================

/**
 * Direction in which attached cards fan out from a parent card.
 *
 * Eight supported values: 4 sides (top, bottom, left, right) and 4 corners
 * (top-left, top-right, bottom-left, bottom-right). Corner directions use a
 * symmetric offset on both axes derived from `revealFraction`.
 */
export type AttachmentDirection =
  | 'top'
  | 'bottom'
  | 'left'
  | 'right'
  | 'top-left'
  | 'top-right'
  | 'bottom-left'
  | 'bottom-right';

export interface AttachmentLayout {
  direction: AttachmentDirection; // Fan direction for attached cards (4 sides + 4 corners)
  revealFraction: number; // 0-1, portion of attached card visible per axis (default: 0.25). Corners use this for both axes.
  maxBeforeCompress?: number; // Compress spacing beyond this count (default: 5)
  parentOnTop?: boolean; // Whether parent renders above children (default: true)
}

export const DEFAULT_ATTACHMENT_LAYOUT: AttachmentLayout = {
  direction: 'bottom',
  revealFraction: 0.25,
  maxBeforeCompress: 5,
  parentOnTop: true,
};

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
  // Card-on-card attachment configuration
  attachmentLayout?: AttachmentLayout; // Default layout for card-on-card attachments
  // Orientation rules — see OrientationRule for semantics
  orientationRules?: OrientationRule[]; // Plugin-declared orientation rules (walked in order, first match wins)
}

// ============================================================================
// Shared Object Definition Types
// ============================================================================
// These Def types define "what to create" for each object kind, shared between
// scenario LayoutObjects (explicit positioning) and ComponentSet items (row-based).

/** Stack definition — cards to place as a stack */
export interface StackDef {
  label: string; // Display label (e.g., "Main Deck", "Hero")
  faceUp: boolean; // Whether stack is face-up
  deck?: DeckDefinition; // For static sets: deck definition to expand
  cards?: string[]; // For API results: pre-expanded card codes. Takes precedence over deck.
}

/** Token definition — references a token in the asset pack */
export interface TokenDef {
  ref: string; // Key in asset pack's `tokens`
  label?: string; // Optional display label
}

/** Counter definition — references a counter in the asset pack */
export interface CounterDef {
  ref: string; // Key in asset pack's `counters`
  label?: string; // Optional display label
  value?: number; // Override starting value (defaults to counter's `start`)
}

/** Mat definition — references a mat in the asset pack */
export interface MatDef {
  ref: string; // Key in asset pack's `mats`
  label?: string; // Optional display label
}

/** Zone definition — references a zone or defines inline dimensions */
export interface ZoneDef {
  ref?: string; // Key in asset pack (optional — can define inline)
  label?: string; // Optional display label
  width?: number; // Width for inline zone definitions
  height?: number; // Height for inline zone definitions
}

// ============================================================================
// Component Set Types
// ============================================================================
// A ComponentSet is a reusable, always-additive collection of game objects.
// Used in three contexts: scenario layouts, standalone loadable sets, API imports.

/** Component set item types extend shared Defs with row-based positioning */
export interface ComponentSetStack extends StackDef {
  row?: number; // Layout row hint (0-based, same-row items placed side-by-side)
}

export interface ComponentSetToken extends TokenDef {
  row?: number;
}

export interface ComponentSetCounter extends CounterDef {
  row?: number;
}

export interface ComponentSetMat extends MatDef {
  row?: number;
}

export interface ComponentSetZone extends ZoneDef {
  row?: number;
}

/** A collection of game objects to place on the table */
export interface ComponentSet {
  stacks?: ComponentSetStack[];
  tokens?: ComponentSetToken[];
  counters?: ComponentSetCounter[];
  mats?: ComponentSetMat[];
  zones?: ComponentSetZone[];
}

// ============================================================================
// Plugin API Import Types
// ============================================================================

/** Configuration for API-backed deck import in a plugin */
export interface PluginApiImport {
  apiEndpoints: {
    public: string; // URL template with {deckId} placeholder
    private?: string; // Optional private deck endpoint
  };
  parserModule: string; // Filename of the parser JS (e.g., "deckImport.js")
  labels: {
    siteName: string; // Display name (e.g., "MarvelCDB")
    inputPlaceholder: string; // Input field placeholder text
  };
}

/** A static component set entry — pure JSON, no code required */
export interface StaticComponentSetEntry extends ComponentSet {
  id: string; // Unique identifier for this component set
  name: string; // Display name shown in UI
}

/** An API-backed component set entry — requires parser JS */
export interface ApiComponentSetEntry {
  id: string; // Unique identifier
  name: string; // Display name shown in UI
  apiImport: PluginApiImport; // API import configuration
}

/** Discriminated union of static and API component set entries */
export type ComponentSetEntry = StaticComponentSetEntry | ApiComponentSetEntry;

/** Type guard: is this entry API-backed? */
export function isApiComponentSetEntry(
  entry: ComponentSetEntry,
): entry is ApiComponentSetEntry {
  return 'apiImport' in entry;
}

// ============================================================================
// Worker Communication Types
// ============================================================================

/** Sent to the Web Worker for API-based deck import */
export interface DeckImportRequest {
  apiResponse: unknown; // Raw JSON response from the external API
  gameAssets: GameAssets; // Full game assets for card/token lookup
}

// Worker returns: ComponentSet (same type as above)

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
  schema: 'ct-scenario@2'; // Schema version identifier
  id: string; // Unique scenario identifier
  name: string; // Human-readable scenario name
  version: string; // Semantic version (e.g., "1.0.0")
  packs: string[]; // Asset pack IDs required for this scenario
  componentSet?: ComponentSet; // Objects to place on the table
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
  // Orientation rules merged from all packs (pack load order is preserved; first match wins at lookup time).
  // Optional so existing test fixtures and pre-migration callers stay valid; mergeAssetPacks always populates an array.
  orientationRules?: OrientationRule[];
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

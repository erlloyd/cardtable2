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
  name: string; // Display name shown in pickers / search; plugins may ship empty string when name is unavailable, callers should fall back to the card code
  type: string; // References a cardType key
  face: string; // Card face image URL
  back?: string; // Optional override of type's back image
  back_code?: string; // Optional partner card code; when face-down, render the partner's `face` (used for two-sided cards like hero/alter-ego pairs and multi-stage main schemes). Resolution order: card.back > partner.face > cardType.back.
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
// Loadables (plugin-declared content the host can load on demand)
// ============================================================================
// A "loadable" is any unit of content a plugin makes available beyond the
// initial scenario boot — scenarios, decks, encounter sets, individual cards.
// The plugin manifest declares them; the host shows a generic two-step picker
// (type → item), and a per-type registry knows how to materialize the choice.
//
// Item-source variants intentionally map onto how items are *discovered* (not
// how they render): static JSON, parser-driven providers (e.g. apiImport), and
// host-derived lists computed from already-loaded asset packs.

/**
 * How adding a loadable affects the existing table.
 *
 * `additive` drops new objects on top of whatever's already there (the common
 * case for cards / encounter sets). `replace` clears the table first (used for
 * scenario swaps). The host enforces this on apply; plugins only declare it.
 */
export type LoadableMode = 'additive' | 'replace';

/**
 * A single item exposed by a loadable category in the picker UI.
 *
 * `data` is intentionally typed to a generic so each loadable type can pin its
 * own item-payload shape (e.g. scenarios use `{ file: string }` to point at a
 * JSON file under the plugin's baseUrl). `unknown` is the safe default at the
 * shared-schema layer; per-type narrowing happens in the consumer.
 */
export interface LoadableStaticItem<TData = unknown> {
  typeId: string; // Stable identifier within this loadable type
  label: string; // Display label for the picker
  data: TData; // Type-specific payload (e.g. scenario file path, card code)
}

/** Static list of items declared inline in the plugin manifest. */
export interface LoadableStaticSource<TData = unknown> {
  kind: 'static';
  items: Array<LoadableStaticItem<TData>>;
  /**
   * Provenance marker preserved when an `asset-pack-derived` source is
   * materialized into a static source by the host's loadables registry
   * (ct-87o). Lets downstream UI tell "all-cards" items apart from
   * arbitrary plugin-declared static items without leaking plugin-defined
   * `type` strings into the picker logic. Absent for genuinely-static
   * (manifest-declared) sources.
   */
  derivedFrom?: LoadableDerivation;
}

/**
 * Endpoint URLs for a provider source's HTTP fetch step. The `public` template
 * is mandatory (the provider always needs a way to fetch a deck); `private` is
 * optional and only used when the user opts in to a private-deck flow.
 *
 * `{deckId}` is substituted at runtime with the user-supplied identifier.
 */
export interface LoadableProviderApiEndpoints {
  public: string; // URL template with {deckId} placeholder
  private?: string; // Optional private-deck endpoint
}

/**
 * Display labels driving the provider's input modal — site name shown in the
 * modal header, placeholder text shown in the input field. Plugins ship these
 * inline so the host stays game-agnostic.
 */
export interface LoadableProviderLabels {
  siteName: string; // e.g. "MarvelCDB"
  inputPlaceholder: string; // e.g. "Enter deck ID (e.g., 12345)"
}

/**
 * Provider-source config: everything the host needs to drive the provider's
 * input modal + HTTP fetch + worker parse. Each field is optional at the
 * shared-schema layer so older manifests still validate; the runtime warns
 * (and aborts the import) when a provider is invoked with incomplete config.
 */
export interface LoadableProviderConfig {
  apiEndpoints?: LoadableProviderApiEndpoints;
  labels?: LoadableProviderLabels;
}

/**
 * Provider-backed source: declares a parser/provider JS module whose runtime
 * function fetches and materializes items dynamically. The host opens a
 * deck-import modal driven by `config.labels`, fetches via
 * `config.apiEndpoints`, and runs the parser in a Web Worker sandbox.
 */
export interface LoadableProviderSource {
  kind: 'provider';
  module: string; // Path (relative to plugin baseUrl) to parser/provider JS
  config?: LoadableProviderConfig;
}

/**
 * How the host should derive items from already-loaded asset packs.
 *
 * Kept as a string union (rather than open-ended) so the host can refuse
 * unknown derivations at parse time. Extend as new derivations are needed.
 */
export type LoadableDerivation = 'all-cards' | 'all-card-sets';

/** Host-computed source: items materialized from merged asset packs at load time. */
export interface LoadableAssetPackDerivedSource {
  kind: 'asset-pack-derived';
  derivation: LoadableDerivation;
}

/** Discriminated union over all supported item-source kinds. */
export type LoadableItemSource<TData = unknown> =
  | LoadableStaticSource<TData>
  | LoadableProviderSource
  | LoadableAssetPackDerivedSource;

/**
 * One loadable category declared by a plugin (e.g. "scenario", "deck",
 * "encounter-set", "card"). `type` is plugin-defined so games can name their
 * own categories; the host treats it as an opaque key for the picker UI and
 * runtime registry.
 */
export interface LoadableEntry<TData = unknown> {
  type: string; // Plugin-defined category key (e.g. "scenario", "deck")
  label: string; // Display label for the picker's first step
  mode: LoadableMode; // Additive vs replace semantics on apply
  source: LoadableItemSource<TData>; // How items are discovered
}

/**
 * Counter-type-definition payload carried by `loadables[]` entries with
 * `type: 'counter'`.
 *
 * Each plugin-declared counter type is the *template* a Counter instance is
 * materialized from (auto-spawn or picker). Template-only by design — the
 * instance-time fields (`typeId`, `currentValue`) are not part of the
 * declaration; they are assigned when a Counter object is created from the
 * template (see ct-c7c, ct-jxl).
 *
 * The loadable's `LoadableStaticItem.id` doubles as the counter type id —
 * resolvers look up a type def by item id. The static item's `label` drives
 * the picker UI; `text` (when set) is the small display label baked into the
 * pill render.
 *
 * Conventional manifest entry:
 *
 * ```json
 * {
 *   "type": "counter",
 *   "label": "Counter",
 *   "mode": "additive",
 *   "source": {
 *     "kind": "static",
 *     "items": [
 *       {
 *         "id": "damage",
 *         "label": "Damage",
 *         "data": {
 *           "color": 16280146,
 *           "text": "DMG",
 *           "min": 0,
 *           "max": 99,
 *           "startingValue": 0
 *         }
 *       }
 *     ]
 *   }
 * }
 * ```
 *
 * Note the distinction from the `Counter` asset-pack interface above:
 * `Counter` (`{label, min, max, start}`) is the *legacy* counter catalog
 * entry used by `ComponentSetCounter.ref`. `CounterTypeDef` is the
 * loadables-system payload for the typed-counter spawn flow.
 */
export interface CounterTypeDef {
  /** RGB number for the pill body (e.g. `0xf39c12`). */
  color: number;
  /** Optional short display label baked into the pill (e.g. `"DMG"`). */
  text?: string;
  /** Optional icon image URL for icon-backed counters. */
  img?: string;
  /** Lower clamp on `currentValue`. */
  min: number;
  /** Upper clamp on `currentValue`. */
  max: number;
  /** Initial `currentValue` when an instance is materialized. */
  startingValue: number;
}

/**
 * Plugin-declared counter-loadable type string. Hard-coded here (rather than
 * left as an arbitrary plugin-defined string) because the host's typed-counter
 * spawn / picker / resolver consumers all key off this same constant; using a
 * shared literal prevents drift across consumers.
 */
export const COUNTER_LOADABLE_TYPE = 'counter';

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

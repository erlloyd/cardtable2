import type {
  AssetPack,
  Scenario,
  GameAssets,
  ResolvedCard,
  CardSize,
} from '@cardtable2/shared';
import { getBackendUrl } from '@/utils/backend';

// ============================================================================
// Asset Pack Loading
// ============================================================================

/**
 * Load an asset pack from a URL
 */
export async function loadAssetPack(url: string): Promise<AssetPack> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to load asset pack from ${url}: ${response.statusText}`,
    );
  }

  const data: unknown = await response.json();

  // Type guard validation
  if (typeof data !== 'object' || data === null) {
    throw new Error(`Invalid asset pack: expected object, got ${typeof data}`);
  }

  const obj = data as Record<string, unknown>;

  // Basic validation
  if (obj.schema !== 'ct-assets@1') {
    throw new Error(
      `Invalid schema: expected "ct-assets@1", got "${String(obj.schema)}"`,
    );
  }

  if (!obj.id || !obj.name || !obj.version) {
    throw new Error(`Missing required fields: id, name, or version`);
  }

  return data as AssetPack;
}

/**
 * Load multiple asset packs in parallel
 */
export async function loadAssetPacks(urls: string[]): Promise<AssetPack[]> {
  const promises = urls.map((url) => loadAssetPack(url));
  return Promise.all(promises);
}

// ============================================================================
// Scenario Loading
// ============================================================================

/**
 * Load a scenario from a URL
 */
export async function loadScenario(url: string): Promise<Scenario> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(
      `Failed to load scenario from ${url}: ${response.statusText}`,
    );
  }

  const data: unknown = await response.json();

  // Type guard validation
  if (typeof data !== 'object' || data === null) {
    throw new Error(`Invalid scenario: expected object, got ${typeof data}`);
  }

  const obj = data as Record<string, unknown>;

  // Basic validation
  if (obj.schema !== 'ct-scenario@1') {
    throw new Error(
      `Invalid schema: expected "ct-scenario@1", got "${String(obj.schema)}"`,
    );
  }

  if (!obj.id || !obj.name || !obj.version || !obj.packs) {
    throw new Error(`Missing required fields: id, name, version, or packs`);
  }

  return data as Scenario;
}

// ============================================================================
// Pack Merging
// ============================================================================

/**
 * Merge multiple asset packs into a single content collection
 * Later packs override earlier packs (last-wins strategy)
 */
export function mergeAssetPacks(packs: AssetPack[]): GameAssets {
  const merged: GameAssets = {
    packs,
    cardTypes: {},
    cards: {},
    cardSets: {},
    tokens: {},
    counters: {},
    mats: {},
  };

  // Merge each pack in order (later packs override earlier ones)
  for (const pack of packs) {
    if (pack.cardTypes) {
      Object.assign(merged.cardTypes, pack.cardTypes);
    }
    if (pack.cards) {
      Object.assign(merged.cards, pack.cards);
    }
    if (pack.cardSets) {
      Object.assign(merged.cardSets, pack.cardSets);
    }
    if (pack.tokens) {
      Object.assign(merged.tokens, pack.tokens);
    }
    if (pack.counters) {
      Object.assign(merged.counters, pack.counters);
    }
    if (pack.mats) {
      Object.assign(merged.mats, pack.mats);
    }
  }

  // Resolve all card URLs (apply baseUrl and prepend backend URL for /api/ paths)
  for (const cardCode of Object.keys(merged.cards)) {
    const card = merged.cards[cardCode];
    const pack = packs.find((p) => p.cards?.[cardCode]);
    const baseUrl = pack?.baseUrl;

    // Resolve face URL
    if (card.face) {
      card.face = resolveAssetUrl(card.face, baseUrl);
    }

    // Resolve back URL if present
    if (card.back) {
      card.back = resolveAssetUrl(card.back, baseUrl);
    }
  }

  // Resolve cardType back URLs
  for (const cardType of Object.values(merged.cardTypes)) {
    if (cardType.back) {
      // CardType backs are usually full URLs, but resolve anyway for consistency
      cardType.back = resolveAssetUrl(cardType.back);
    }
  }

  return merged;
}

// ============================================================================
// URL Resolution
// ============================================================================

/**
 * Resolve a potentially relative URL against a base URL
 * If the URL is already absolute, return it as-is
 */
export function resolveAssetUrl(url: string, baseUrl?: string): string {
  // If URL is already absolute (http/https), return it
  if (url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  // If URL is root-relative and starts with /api/, prepend backend URL
  if (url.startsWith('/api/')) {
    return `${getBackendUrl()}${url}`;
  }

  // If URL is already root-relative (but not API), return it
  if (url.startsWith('/')) {
    return url;
  }

  // If no baseUrl provided, return relative URL as-is
  if (!baseUrl) {
    return url;
  }

  // Combine baseUrl and relative path
  // Remove trailing slash from baseUrl if present
  const base = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  // Add leading slash to url if missing
  const path = url.startsWith('/') ? url : `/${url}`;

  const resolved = `${base}${path}`;

  // If resolved URL is an API path, prepend backend URL
  if (resolved.startsWith('/api/')) {
    return `${getBackendUrl()}${resolved}`;
  }

  return resolved;
}

// ============================================================================
// Card Type Inheritance
// ============================================================================

/**
 * Resolve a card by applying type inheritance and URL resolution
 */
export function resolveCard(
  cardCode: string,
  content: GameAssets,
): ResolvedCard {
  const card = content.cards[cardCode];
  if (!card) {
    throw new Error(`Card not found: ${cardCode}`);
  }

  const cardType = content.cardTypes[card.type];
  if (!cardType) {
    throw new Error(`Card type not found: ${card.type} (for card ${cardCode})`);
  }

  // Find the pack that defined this card (for baseUrl)
  const pack = content.packs.find((p) => p.cards?.[cardCode]);
  const baseUrl = pack?.baseUrl;

  // Resolve size (card override > type default > standard)
  const size: CardSize = card.size ?? cardType.size ?? 'standard';

  // Resolve back image (card override > type default)
  const backUrl = card.back ?? cardType.back;
  if (!backUrl) {
    throw new Error(
      `No back image defined for card ${cardCode} or type ${card.type}`,
    );
  }

  return {
    code: cardCode,
    type: card.type,
    face: resolveAssetUrl(card.face, baseUrl),
    back: resolveAssetUrl(backUrl, baseUrl),
    size,
  };
}

/**
 * Resolve all cards in a content collection
 */
export function resolveAllCards(
  content: GameAssets,
): Map<string, ResolvedCard> {
  const resolved = new Map<string, ResolvedCard>();

  for (const cardCode of Object.keys(content.cards)) {
    resolved.set(cardCode, resolveCard(cardCode, content));
  }

  return resolved;
}

// ============================================================================
// Standard Size Defaults
// ============================================================================

/**
 * Get pixel dimensions for a card size
 */
export function getCardDimensions(size: CardSize): [number, number] {
  if (Array.isArray(size)) {
    return size;
  }

  switch (size) {
    case 'standard':
      return [180, 252];
    case 'bridge':
      return [144, 252]; // Narrower than standard
    case 'tarot':
      return [180, 324]; // Taller than standard
    case 'mini':
      return [108, 151]; // 60% of standard
    case 'jumbo':
      return [270, 378]; // 150% of standard
    default:
      return [180, 252]; // Default to standard
  }
}

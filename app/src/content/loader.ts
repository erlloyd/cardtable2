import type {
  AssetPack,
  Scenario,
  GameAssets,
  ResolvedCard,
  CardSize,
} from '@cardtable2/shared';
import { getBackendUrl } from '@/utils/backend';
import {
  ASSETPACK_FETCH_FAILED,
  ASSETPACK_PARSE_FAILED,
  ASSETPACK_INVALID_SCHEMA,
  SCENARIO_FETCH_FAILED,
  SCENARIO_PARSE_FAILED,
  SCENARIO_INVALID_SCHEMA,
  CARD_IMAGE_NOT_FOUND,
  CARD_IMAGE_NO_BACK,
} from '../constants/errorIds';

// ============================================================================
// Asset Pack Loading
// ============================================================================

/**
 * Load an asset pack from a URL
 */
export async function loadAssetPack(url: string): Promise<AssetPack> {
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Loader] Network error loading asset pack', {
      errorId: ASSETPACK_FETCH_FAILED,
      url,
      error: message,
    });
    throw new Error(`Network error loading asset pack from ${url}: ${message}`);
  }

  if (!response.ok) {
    console.error('[Loader] Asset pack fetch failed', {
      errorId: ASSETPACK_FETCH_FAILED,
      url,
      status: response.status,
      statusText: response.statusText,
    });
    throw new Error(
      `Failed to load asset pack: HTTP ${response.status} ${response.statusText} (${url})`,
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Loader] Failed to parse asset pack JSON', {
      errorId: ASSETPACK_PARSE_FAILED,
      url,
      error: message,
    });
    throw new Error(`Invalid JSON in asset pack from ${url}: ${message}`);
  }

  return validateAssetPack(data, url);
}

/**
 * Load an asset pack from JSON string (for local plugins)
 */
export function loadAssetPackFromString(
  json: string,
  source: string = 'string',
): AssetPack {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Loader] Failed to parse asset pack JSON string', {
      errorId: ASSETPACK_PARSE_FAILED,
      source,
      error: message,
    });
    throw new Error(`Invalid JSON in asset pack from ${source}: ${message}`);
  }

  return validateAssetPack(data, source);
}

/**
 * Validate asset pack data
 */
function validateAssetPack(data: unknown, source: string): AssetPack {
  // Type guard validation
  if (typeof data !== 'object' || data === null) {
    console.error('[Loader] Invalid asset pack structure', {
      errorId: ASSETPACK_INVALID_SCHEMA,
      source,
      type: typeof data,
    });
    throw new Error(
      `Invalid asset pack from ${source}: expected object, got ${typeof data}`,
    );
  }

  const obj = data as Record<string, unknown>;

  // Basic validation
  if (obj.schema !== 'ct-assets@1') {
    console.error('[Loader] Invalid asset pack schema', {
      errorId: ASSETPACK_INVALID_SCHEMA,
      source,
      schema: obj.schema,
    });
    throw new Error(
      `Invalid schema in asset pack from ${source}: expected "ct-assets@1", got "${String(obj.schema)}"`,
    );
  }

  if (!obj.id || !obj.name || !obj.version) {
    console.error('[Loader] Asset pack missing required fields', {
      errorId: ASSETPACK_INVALID_SCHEMA,
      source,
      hasId: !!obj.id,
      hasName: !!obj.name,
      hasVersion: !!obj.version,
    });
    throw new Error(
      `Missing required fields in asset pack from ${source}: id, name, or version`,
    );
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
  let response;
  try {
    response = await fetch(url);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Loader] Network error loading scenario', {
      errorId: SCENARIO_FETCH_FAILED,
      url,
      error: message,
    });
    throw new Error(`Network error loading scenario from ${url}: ${message}`);
  }

  if (!response.ok) {
    console.error('[Loader] Scenario fetch failed', {
      errorId: SCENARIO_FETCH_FAILED,
      url,
      status: response.status,
      statusText: response.statusText,
    });
    throw new Error(
      `Failed to load scenario: HTTP ${response.status} ${response.statusText} (${url})`,
    );
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Loader] Failed to parse scenario JSON', {
      errorId: SCENARIO_PARSE_FAILED,
      url,
      error: message,
    });
    throw new Error(`Invalid JSON in scenario from ${url}: ${message}`);
  }

  return validateScenario(data);
}

/**
 * Load a scenario from JSON string (for local plugins)
 */
export function loadScenarioFromString(
  json: string,
  source: string = 'string',
): Scenario {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Loader] Failed to parse scenario JSON string', {
      errorId: SCENARIO_PARSE_FAILED,
      source,
      error: message,
    });
    throw new Error(`Invalid JSON in scenario from ${source}: ${message}`);
  }

  return validateScenario(data);
}

/**
 * Validate scenario data
 */
function validateScenario(data: unknown): Scenario {
  // Type guard validation
  if (typeof data !== 'object' || data === null) {
    console.error('[Loader] Invalid scenario structure', {
      errorId: SCENARIO_INVALID_SCHEMA,
      type: typeof data,
    });
    throw new Error(`Invalid scenario: expected object, got ${typeof data}`);
  }

  const obj = data as Record<string, unknown>;

  // Basic validation
  if (obj.schema !== 'ct-scenario@1') {
    console.error('[Loader] Invalid scenario schema', {
      errorId: SCENARIO_INVALID_SCHEMA,
      schema: obj.schema,
    });
    throw new Error(
      `Invalid schema: expected "ct-scenario@1", got "${String(obj.schema)}"`,
    );
  }

  if (!obj.id || !obj.name || !obj.version || !obj.packs) {
    console.error('[Loader] Scenario missing required fields', {
      errorId: SCENARIO_INVALID_SCHEMA,
      hasId: !!obj.id,
      hasName: !!obj.name,
      hasVersion: !!obj.version,
      hasPacks: !!obj.packs,
    });
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
  // For cards and cardTypes, create new objects with resolved URLs (no mutation)
  for (const pack of packs) {
    // Merge cardTypes with URL resolution
    if (pack.cardTypes) {
      for (const [typeCode, cardType] of Object.entries(pack.cardTypes)) {
        merged.cardTypes[typeCode] = cardType.back
          ? { ...cardType, back: resolveAssetUrl(cardType.back, pack.baseUrl) }
          : cardType;
      }
    }

    // Merge cards with URL resolution
    if (pack.cards) {
      for (const [cardCode, card] of Object.entries(pack.cards)) {
        merged.cards[cardCode] = {
          ...card,
          face: card.face
            ? resolveAssetUrl(card.face, pack.baseUrl)
            : card.face,
          back: card.back
            ? resolveAssetUrl(card.back, pack.baseUrl)
            : card.back,
        };
      }
    }

    // Other asset types don't need URL resolution
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
    console.error('[Loader] Card not found in content', {
      errorId: CARD_IMAGE_NOT_FOUND,
      cardCode,
      availableCards: Object.keys(content.cards),
    });
    throw new Error(`Card not found: ${cardCode}`);
  }

  const cardType = content.cardTypes[card.type];
  if (!cardType) {
    console.error('[Loader] Card type not found', {
      errorId: CARD_IMAGE_NOT_FOUND,
      cardCode,
      cardType: card.type,
      availableTypes: Object.keys(content.cardTypes),
    });
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
    console.error('[Loader] No back image defined for card', {
      errorId: CARD_IMAGE_NO_BACK,
      cardCode,
      cardType: card.type,
      hasCardBack: !!card.back,
      hasTypeBack: !!cardType.back,
    });
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

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/restrict-template-expressions */
/* eslint-disable @typescript-eslint/require-await */

/**
 * ESLint suppressions above are necessary for Playwright E2E test helpers.
 *
 * These helpers use page.evaluate() which runs code in the browser context where:
 * 1. We must access globalThis (typed as any) to reach test-only globals
 * 2. We cannot import type definitions into the browser sandbox
 * 3. Generic type parameters may be primitives or objects
 *
 * These suppressions are standard practice for Playwright tests.
 */

import type { Page } from '@playwright/test';

/**
 * Debug helper that dumps store state and renderer info when tests fail.
 * Call this before assertions to capture state for debugging CI failures.
 */
export async function dumpDebugState(page: Page, label: string): Promise<void> {
  const state = await page.evaluate(() => {
    const __TEST_STORE__ = (globalThis as any).__TEST_STORE__;
    const __TEST_BOARD__ = (globalThis as any).__TEST_BOARD__;

    if (!__TEST_STORE__) {
      return { error: 'TEST_STORE not available' };
    }

    const objects = __TEST_STORE__.getAllObjects();
    const objectsArray = Array.from(objects.entries()).map(
      ([id, obj]: [string, any]) => ({
        id,
        kind: obj._kind,
        pos: obj._pos,
        selectedBy: obj._selectedBy,
        sortKey: obj._sortKey,
      }),
    );

    return {
      objectCount: objects.size,
      selectedCount: objectsArray.filter((obj) => obj.selectedBy !== null)
        .length,
      objects: objectsArray,
      boardAvailable: !!__TEST_BOARD__,
    };
  });

  console.log(`[DEBUG ${label}]:`, JSON.stringify(state, null, 2));
}

/**
 * Enhanced expect wrapper that dumps debug state before assertions.
 * Use this instead of expect() for critical assertions that fail in CI.
 */
export async function expectWithDebug<T>(
  page: Page,
  label: string,
  actual: T,
): Promise<{
  toBe: (expected: T) => Promise<void>;
  toBeGreaterThan: (expected: number) => Promise<void>;
}> {
  await dumpDebugState(page, label);

  return {
    toBe: async (expected: T) => {
      if (actual !== expected) {
        console.error(
          `[ASSERTION FAILED] Expected ${actual} to be ${expected}`,
        );
        throw new Error(`Expected ${actual} to be ${expected}`);
      }
    },
    toBeGreaterThan: async (expected: number) => {
      if (typeof actual !== 'number' || actual <= expected) {
        console.error(
          `[ASSERTION FAILED] Expected ${actual} to be greater than ${expected}`,
        );
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
  };
}

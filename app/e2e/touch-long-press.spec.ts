/**
 * Touch long-press opens the board context menu (ct-eok.17).
 *
 * iOS Safari never fires `contextmenu` on a long-press, so the board starts
 * its own ~500ms timer for touch pointers. Real touch input is injected via
 * CDP so the canvas receives genuine `pointerType: 'touch'` events.
 */

import type { CDPSession, Page } from '@playwright/test';
import { test, expect } from './_fixtures';

test.use({ hasTouch: true, isMobile: true });

interface Point {
  x: number;
  y: number;
}

async function stackViewportPoint(page: Page): Promise<Point> {
  return page.evaluate(() => {
    const store = (globalThis as any).__TEST_STORE__;
    const canvas = document.querySelector('canvas')!;
    const rect = canvas.getBoundingClientRect();
    const stack = Array.from(store.getAllObjects().values()).find(
      (obj: any) => obj._kind === 'stack',
    ) as any;
    return {
      x: rect.left + rect.width / 2 + stack._pos.x,
      y: rect.top + rect.height / 2 + stack._pos.y,
    };
  });
}

async function touchStart(cdp: CDPSession, p: Point): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [{ x: p.x, y: p.y }],
  });
}

async function touchMove(cdp: CDPSession, p: Point): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchMove',
    touchPoints: [{ x: p.x, y: p.y }],
  });
}

async function touchEnd(cdp: CDPSession): Promise<void> {
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchEnd',
    touchPoints: [],
  });
}

async function touchTap(cdp: CDPSession, p: Point): Promise<void> {
  await touchStart(cdp, p);
  await touchEnd(cdp);
}

async function selectedCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const store = (globalThis as any).__TEST_STORE__;
    return Array.from(store.getAllObjects().values()).filter(
      (obj: any) => obj._selectedBy !== null,
    ).length;
  });
}

// iOS Safari always runs the renderer on the main thread, where renderer
// responses are delivered synchronously inside sendMessage; Chromium runs it
// in a worker, where they arrive asynchronously. Both must behave the same.
for (const renderMode of ['worker', 'main-thread']) {
  test.describe(`Touch long-press context menu (${renderMode})`, () => {
    let cdp: CDPSession;
    let stackPoint: Point;

    test.beforeEach(async ({ page }, testInfo) => {
      const tableId = `long-press-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`;
      await page.goto(`/dev/table/${tableId}?renderMode=${renderMode}`);

      await expect(page.locator('text=Store: ✓ Ready')).toBeVisible({
        timeout: 10000,
      });
      await expect(page.getByTestId('worker-status')).toContainText(
        'Initialized',
        { timeout: 5000 },
      );
      await page.waitForFunction(
        () => (globalThis as any).__TEST_BOARD__ !== undefined,
        { timeout: 5000 },
      );

      await page.click('button:has-text("Reset to Test Scene")');
      await expect(page.locator('text=Objects: 15')).toBeVisible({
        timeout: 5000,
      });
      await page.evaluate(async () => {
        await (globalThis as any).__TEST_BOARD__.waitForRenderer();
      });

      stackPoint = await stackViewportPoint(page);
      cdp = await page.context().newCDPSession(page);
    });

    test('holding a touch on a stack opens the context menu and selects it', async ({
      page,
    }) => {
      await touchStart(cdp, stackPoint);
      await page.waitForTimeout(700);
      await expect(page.locator('.context-menu')).toHaveCount(1);
      await expect(page.locator('.context-menu')).toBeVisible();
      await touchEnd(cdp);

      const selectedCount = await page.evaluate(() => {
        const store = (globalThis as any).__TEST_STORE__;
        return Array.from(store.getAllObjects().values()).filter(
          (obj: any) => obj._selectedBy !== null,
        ).length;
      });
      expect(selectedCount).toBe(1);
      await expect(page.locator('.context-menu')).toHaveCount(1);
    });

    test('a short tap does not open the context menu', async ({ page }) => {
      await touchStart(cdp, stackPoint);
      await page.waitForTimeout(150);
      await touchEnd(cdp);
      await page.waitForTimeout(700);

      await expect(page.locator('.context-menu')).toHaveCount(0);
    });

    test('dragging a stack with touch does not open the context menu', async ({
      page,
    }) => {
      await touchStart(cdp, stackPoint);
      for (let i = 1; i <= 8; i++) {
        await touchMove(cdp, { x: stackPoint.x + i * 10, y: stackPoint.y });
        await page.waitForTimeout(100);
      }
      await page.waitForTimeout(700);
      await touchEnd(cdp);

      await expect(page.locator('.context-menu')).toHaveCount(0);
    });

    test('long-pressing an already-selected stack still opens the menu', async ({
      page,
    }) => {
      await touchTap(cdp, stackPoint);
      await page.evaluate(async () => {
        await (globalThis as any).__TEST_BOARD__.waitForRenderer();
      });
      expect(await selectedCount(page)).toBe(1);
      await page.waitForTimeout(400);

      await touchStart(cdp, stackPoint);
      await page.waitForTimeout(700);
      await expect(page.locator('.context-menu')).toHaveCount(1);
      await touchEnd(cdp);
    });

    test('closing the long-press menu and tapping elsewhere does not reopen it', async ({
      page,
    }) => {
      const emptyPoint = { x: stackPoint.x + 250, y: stackPoint.y + 250 };

      await touchStart(cdp, stackPoint);
      await page.waitForTimeout(700);
      await touchEnd(cdp);

      // A menu that opens and is closed again within one tap never lingers in
      // the DOM, so watch for any mount from here on.
      await page.evaluate(() => {
        const w = globalThis as any;
        w.__menuMounts = 0;
        new MutationObserver((records) => {
          for (const record of records) {
            record.addedNodes.forEach((node) => {
              if (
                node instanceof HTMLElement &&
                (node.matches('.context-menu') ||
                  node.querySelector('.context-menu'))
              ) {
                w.__menuMounts++;
              }
            });
          }
        }).observe(document.body, { childList: true, subtree: true });
      });

      await touchTap(cdp, emptyPoint);
      await page.waitForTimeout(500);
      await touchTap(cdp, emptyPoint);
      await page.waitForTimeout(500);

      await expect(page.locator('.context-menu')).toHaveCount(0);
      expect(await page.evaluate(() => (globalThis as any).__menuMounts)).toBe(
        0,
      );
    });
  });
}

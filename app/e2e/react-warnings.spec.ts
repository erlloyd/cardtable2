import { test, expect } from './_fixtures';

test.describe('React console warnings', () => {
  test('first load of an empty table logs no duplicate-key warning (ct-1mv.11)', async ({
    page,
  }, testInfo) => {
    const warnings: string[] = [];
    page.on('console', (msg) => {
      if (msg.text().includes('two children with the same key')) {
        warnings.push(msg.text());
      }
    });

    const tableId = `rw-${testInfo.testId.replace(/[^a-z0-9]/gi, '-')}`;
    await page.goto(`/table/${tableId}`);
    await page.waitForSelector('[data-testid="board"]');
    await page.waitForFunction(
      () => (globalThis as { __TEST_STORE__?: unknown }).__TEST_STORE__,
    );

    expect(warnings).toEqual([]);
  });
});

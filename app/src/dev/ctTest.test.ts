/**
 * Unit tests for the dev-only ctTest canvas interaction helpers.
 *
 * These tests verify world<->viewport coordinate math and event-dispatch
 * shape without requiring a real Pixi canvas or Playwright.  The full
 * integration is exercised from `browser_evaluate` in Playwright MCP
 * sessions (see ct-kiu.1 smoke-test recipe).
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { createCtTestApi } from './ctTest';

describe('ctTest', () => {
  let canvas: HTMLCanvasElement;
  let received: PointerEvent[];

  beforeEach(() => {
    canvas = document.createElement('canvas');
    // Simulate a 1000x800 canvas positioned at viewport (100, 50).
    Object.defineProperty(canvas, 'clientWidth', { value: 1000 });
    Object.defineProperty(canvas, 'clientHeight', { value: 800 });
    canvas.getBoundingClientRect = () =>
      ({
        left: 100,
        top: 50,
        right: 1100,
        bottom: 850,
        width: 1000,
        height: 800,
        x: 100,
        y: 50,
        toJSON: () => ({}),
      }) as DOMRect;
    document.body.appendChild(canvas);

    received = [];
    canvas.addEventListener('pointerdown', (e) => received.push(e));
    canvas.addEventListener('pointermove', (e) => received.push(e));
    canvas.addEventListener('pointerup', (e) => received.push(e));
  });

  afterEach(() => {
    canvas.remove();
    vi.useRealTimers();
  });

  it('worldToViewport: world (0,0) maps to canvas center + rect offset', () => {
    const api = createCtTestApi();
    // World (0,0) -> canvas (500, 400) -> viewport (600, 450).
    expect(api.worldToViewport({ x: 0, y: 0 })).toEqual({ x: 600, y: 450 });
  });

  it('worldToViewport: positive world coords shift toward bottom-right', () => {
    const api = createCtTestApi();
    expect(api.worldToViewport({ x: 100, y: 50 })).toEqual({ x: 700, y: 500 });
  });

  it('worldToViewport: negative world coords shift toward top-left', () => {
    const api = createCtTestApi();
    expect(api.worldToViewport({ x: -200, y: -100 })).toEqual({
      x: 400,
      y: 350,
    });
  });

  it('pointerDown dispatches a PointerEvent with viewport-absolute coords', () => {
    const api = createCtTestApi();
    api.pointerDown({ x: 0, y: 0 });

    expect(received).toHaveLength(1);
    const evt = received[0];
    expect(evt.type).toBe('pointerdown');
    expect(evt.clientX).toBe(600);
    expect(evt.clientY).toBe(450);
    expect(evt.buttons).toBe(1);
    expect(evt.button).toBe(0);
    expect(evt.pointerType).toBe('mouse');
    expect(evt.isPrimary).toBe(true);
    expect(evt.bubbles).toBe(true);
  });

  it('pointerUp defaults buttons to 0', () => {
    const api = createCtTestApi();
    api.pointerUp({ x: 0, y: 0 });

    expect(received[0].type).toBe('pointerup');
    expect(received[0].buttons).toBe(0);
  });

  it('click dispatches down then up at the same world point', () => {
    const api = createCtTestApi();
    api.click({ x: 50, y: 25 });

    expect(received).toHaveLength(2);
    expect(received[0].type).toBe('pointerdown');
    expect(received[1].type).toBe('pointerup');
    expect(received[0].clientX).toBe(received[1].clientX);
    expect(received[0].clientY).toBe(received[1].clientY);
  });

  it('drag emits down + N interpolated moves + up', async () => {
    const api = createCtTestApi();
    await api.drag({ x: 0, y: 0 }, { x: 100, y: 0 }, { steps: 4 });

    // 1 down + 4 moves + 1 up = 6 events.
    expect(received).toHaveLength(6);
    expect(received[0].type).toBe('pointerdown');
    expect(received[received.length - 1].type).toBe('pointerup');

    // Moves should interpolate linearly from start to end in viewport
    // coords: down at (600,450), up at (700,450), moves at 25/50/75/100 %.
    const moveXs = received.slice(1, 5).map((e) => e.clientX);
    expect(moveXs).toEqual([625, 650, 675, 700]);
  });

  it('modifier keys pass through to the dispatched event', () => {
    const api = createCtTestApi();
    api.pointerDown({ x: 0, y: 0 }, { modifiers: { altKey: true } });

    expect(received[0].altKey).toBe(true);
    expect(received[0].shiftKey).toBe(false);
  });

  it('getCanvas throws when no canvas is present', () => {
    canvas.remove();
    const api = createCtTestApi();
    expect(() => api.getCanvas()).toThrow(/No <canvas> element found/);
  });
});

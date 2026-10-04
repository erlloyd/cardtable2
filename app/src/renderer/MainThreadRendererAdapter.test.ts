import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MainThreadRendererAdapter } from './MainThreadRendererAdapter';

describe('MainThreadRendererAdapter', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('sends ready after connect()', () => {
    const adapter = new MainThreadRendererAdapter();
    const handler = vi.fn();
    adapter.onMessage(handler);

    adapter.connect();
    expect(handler).not.toHaveBeenCalled();

    vi.runAllTimers();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ type: 'ready' });
    adapter.disconnect();
  });

  it('does not send ready if disconnected first; StrictMode sequence sends once', () => {
    const adapter = new MainThreadRendererAdapter();
    const handler = vi.fn();
    adapter.onMessage(handler);

    adapter.connect();
    adapter.disconnect();
    adapter.connect();
    vi.runAllTimers();

    expect(handler).toHaveBeenCalledTimes(1);
    adapter.disconnect();
  });

  it('throws on sendMessage while disconnected', () => {
    const adapter = new MainThreadRendererAdapter();

    expect(() =>
      adapter.sendMessage({ type: 'resize', width: 1, height: 1, dpr: 1 }),
    ).toThrow();
  });
});

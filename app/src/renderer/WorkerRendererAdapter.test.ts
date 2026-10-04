import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkerRendererAdapter } from './WorkerRendererAdapter';

class FakeWorker {
  static instances: FakeWorker[] = [];
  terminated = false;
  posted: unknown[] = [];

  constructor() {
    FakeWorker.instances.push(this);
  }

  addEventListener() {}

  postMessage(message: unknown) {
    this.posted.push(message);
  }

  terminate() {
    this.terminated = true;
  }
}

describe('WorkerRendererAdapter', () => {
  beforeEach(() => {
    FakeWorker.instances = [];
    vi.stubGlobal('Worker', FakeWorker);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('constructs no Worker until connect()', () => {
    const adapter = new WorkerRendererAdapter();

    expect(FakeWorker.instances).toHaveLength(0);

    adapter.connect();

    expect(FakeWorker.instances).toHaveLength(1);
  });

  it('connect -> disconnect -> connect leaves exactly one live worker', () => {
    const adapter = new WorkerRendererAdapter();

    adapter.connect();
    adapter.disconnect();
    adapter.connect();

    expect(FakeWorker.instances).toHaveLength(2);
    expect(FakeWorker.instances[0].terminated).toBe(true);
    expect(FakeWorker.instances[1].terminated).toBe(false);

    adapter.sendMessage({ type: 'resize', width: 1, height: 1, dpr: 1 });
    expect(FakeWorker.instances[0].posted).toHaveLength(0);
    expect(FakeWorker.instances[1].posted).toHaveLength(1);
  });

  it('throws on sendMessage while disconnected', () => {
    const adapter = new WorkerRendererAdapter();
    const message = { type: 'resize', width: 1, height: 1, dpr: 1 } as const;

    expect(() => adapter.sendMessage(message)).toThrow();

    adapter.connect();
    adapter.disconnect();

    expect(() => adapter.sendMessage(message)).toThrow();
  });
});

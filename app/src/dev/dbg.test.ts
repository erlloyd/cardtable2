/**
 * Unit tests for the subsystem-scoped debug logger.
 */

import type { MockInstance } from 'vitest';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { dbg, dbgApi, installDbg, __resetDbgForTests } from './dbg';

describe('dbg', () => {
  let logSpy: MockInstance<typeof console.log>;

  beforeEach(() => {
    __resetDbgForTests();
    logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => {
    logSpy.mockRestore();
    __resetDbgForTests();
  });

  it('is silent by default', () => {
    dbg('drag', 'hello');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('emits once a subsystem is enabled', () => {
    dbgApi.enable('drag');
    dbg('drag', 'hello', 42);
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('[DEBUG][drag]', 'hello', 42);
  });

  it('scopes logs per subsystem', () => {
    dbgApi.enable('drag');
    dbg('drag', 'yes');
    dbg('attach', 'no');
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('[DEBUG][drag]', 'yes');
  });

  it('disable removes a subsystem', () => {
    dbgApi.enable('drag', 'attach');
    dbgApi.disable('drag');
    dbg('drag', 'x');
    dbg('attach', 'y');
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).toHaveBeenCalledWith('[DEBUG][attach]', 'y');
  });

  it('disableAll clears everything', () => {
    dbgApi.enable('drag', 'attach', 'sync');
    dbgApi.disableAll();
    dbg('drag', 'x');
    dbg('attach', 'y');
    dbg('sync', 'z');
    expect(logSpy).not.toHaveBeenCalled();
  });

  it('list returns enabled subsystems sorted', () => {
    dbgApi.enable('sync', 'attach', 'drag');
    expect(dbgApi.list()).toEqual(['attach', 'drag', 'sync']);
  });

  it('isEnabled reflects current state', () => {
    expect(dbg.isEnabled('drag')).toBe(false);
    dbgApi.enable('drag');
    expect(dbg.isEnabled('drag')).toBe(true);
    expect(dbgApi.isEnabled('drag')).toBe(true);
  });

  it('persists enabled subsystems to localStorage', () => {
    dbgApi.enable('drag', 'attach');
    const raw = localStorage.getItem('ctDebugSubsystems');
    expect(raw).not.toBeNull();
    const parsed = JSON.parse(raw!) as string[];
    expect(parsed.sort()).toEqual(['attach', 'drag']);
  });

  it('installDbg loads enabled state from localStorage', () => {
    localStorage.setItem(
      'ctDebugSubsystems',
      JSON.stringify(['sync', 'input']),
    );
    installDbg();
    expect(dbgApi.list()).toEqual(['input', 'sync']);
  });

  it('installDbg merges URL ?debug=... param with stored state', () => {
    localStorage.setItem('ctDebugSubsystems', JSON.stringify(['sync']));
    const origUrl = window.location.href;
    window.history.replaceState({}, '', '/?debug=drag,attach');
    try {
      installDbg();
      expect(dbgApi.list()).toEqual(['attach', 'drag', 'sync']);
    } finally {
      window.history.replaceState({}, '', origUrl);
    }
  });

  it('installDbg is idempotent', () => {
    installDbg();
    const first = window.__dbg;
    installDbg();
    expect(window.__dbg).toBe(first);
  });

  it('empty subsystem names are ignored by enable', () => {
    dbgApi.enable('', 'drag');
    expect(dbgApi.isEnabled('drag')).toBe(true);
    expect(dbgApi.isEnabled('')).toBe(false);
  });

  describe('comma-split parity (matches ?debug= URL param)', () => {
    it('enable splits a single comma-delimited argument', () => {
      dbgApi.enable('a,b,c');
      expect(dbgApi.list()).toEqual(['a', 'b', 'c']);
    });

    it('enable trims whitespace around comma-split names', () => {
      dbgApi.enable('a, b , c');
      expect(dbgApi.list()).toEqual(['a', 'b', 'c']);
    });

    it('enable accepts a mix of positional args and comma-delimited strings', () => {
      dbgApi.enable('a', 'b,c');
      expect(dbgApi.list()).toEqual(['a', 'b', 'c']);
    });

    it('disable splits on commas too', () => {
      dbgApi.enable('a', 'b', 'c');
      dbgApi.disable('a,b');
      expect(dbgApi.list()).toEqual(['c']);
    });
  });
});

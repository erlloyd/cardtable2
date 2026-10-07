import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  TOAST_DURATION_MS,
  dismissToast,
  getToasts,
  showToast,
  subscribeToasts,
} from './toastStore';

describe('toastStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    for (const t of getToasts()) {
      dismissToast(t.id);
    }
    vi.useRealTimers();
  });

  it('adds a toast with the given kind, defaulting to info', () => {
    showToast('hello');
    showToast('boom', 'error');
    expect(getToasts().map((t) => [t.message, t.kind])).toEqual([
      ['hello', 'info'],
      ['boom', 'error'],
    ]);
  });

  it('removes a toast after TOAST_DURATION_MS', () => {
    showToast('hello');
    vi.advanceTimersByTime(TOAST_DURATION_MS - 1);
    expect(getToasts()).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(getToasts()).toHaveLength(0);
  });

  it('dismissToast removes early and the timer does not notify again', () => {
    const listener = vi.fn();
    showToast('hello');
    const unsubscribe = subscribeToasts(listener);
    dismissToast(getToasts()[0].id);
    expect(getToasts()).toHaveLength(0);
    expect(listener).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(TOAST_DURATION_MS);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('dismissToast is a no-op for unknown ids', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToasts(listener);
    dismissToast(-1);
    expect(listener).not.toHaveBeenCalled();
    unsubscribe();
  });

  it('expires toasts independently', () => {
    showToast('first');
    vi.advanceTimersByTime(2000);
    showToast('second');
    vi.advanceTimersByTime(TOAST_DURATION_MS - 2000);
    expect(getToasts().map((t) => t.message)).toEqual(['second']);
    vi.advanceTimersByTime(2000);
    expect(getToasts()).toHaveLength(0);
  });

  it('keeps getToasts reference-stable until a change, then returns a new array', () => {
    const empty = getToasts();
    expect(getToasts()).toBe(empty);
    showToast('hello');
    const one = getToasts();
    expect(one).not.toBe(empty);
    expect(getToasts()).toBe(one);
    dismissToast(one[0].id);
    expect(getToasts()).not.toBe(one);
  });

  it('notifies once per change and stops after unsubscribe', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToasts(listener);
    showToast('hello');
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    showToast('again');
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

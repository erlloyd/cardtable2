/**
 * Unit tests for the dev/test-only attachment direction override module.
 *
 * The module is essentially a typed singleton; these tests just lock in
 * the set/get/clear contract so a future refactor (e.g. moving the value
 * into a context or store) doesn't silently break the read site in
 * `BoardMessageBus.attach-cards`.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  getAttachmentDirectionOverride,
  setAttachmentDirectionOverride,
  __resetAttachmentOverrideForTests,
} from './attachmentOverride';

describe('attachmentOverride', () => {
  beforeEach(() => {
    __resetAttachmentOverrideForTests();
  });

  it('returns null by default (no override set)', () => {
    expect(getAttachmentDirectionOverride()).toBeNull();
  });

  it('round-trips a single direction (set, get)', () => {
    setAttachmentDirectionOverride('top-right');
    expect(getAttachmentDirectionOverride()).toBe('top-right');
  });

  it('overwrites the previous value when set again', () => {
    setAttachmentDirectionOverride('top-right');
    setAttachmentDirectionOverride('bottom-left');
    expect(getAttachmentDirectionOverride()).toBe('bottom-left');
  });

  it('clears the override when set to null', () => {
    setAttachmentDirectionOverride('top-right');
    setAttachmentDirectionOverride(null);
    expect(getAttachmentDirectionOverride()).toBeNull();
  });

  it('__resetAttachmentOverrideForTests clears any prior value', () => {
    setAttachmentDirectionOverride('right');
    __resetAttachmentOverrideForTests();
    expect(getAttachmentDirectionOverride()).toBeNull();
  });

  it('accepts each of the eight supported directions', () => {
    const directions = [
      'top',
      'bottom',
      'left',
      'right',
      'top-left',
      'top-right',
      'bottom-left',
      'bottom-right',
    ] as const;

    for (const dir of directions) {
      setAttachmentDirectionOverride(dir);
      expect(getAttachmentDirectionOverride()).toBe(dir);
    }
  });
});

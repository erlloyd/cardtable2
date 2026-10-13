import { describe, it, expect } from 'vitest';
import { clearAttachmentKeys } from './attachmentClear';

const meta = () => ({
  label: 'kept',
  attachments: {
    tokens: { damage: 3 },
    status: { stunned: 1 },
    modifiers: { ATK: -1 },
    icons: ['guard'],
  },
});

describe('clearAttachmentKeys', () => {
  it.each(['tokens', 'status', 'modifiers'] as const)(
    'drops only %s',
    (key) => {
      const expected = meta();
      delete expected.attachments[key];

      expect(clearAttachmentKeys(meta(), [key])).toStrictEqual(expected);
    },
  );

  it('drops all three and keeps icons and other _meta fields', () => {
    expect(
      clearAttachmentKeys(meta(), ['tokens', 'status', 'modifiers']),
    ).toStrictEqual({ label: 'kept', attachments: { icons: ['guard'] } });
  });

  it('removes the attachments key when nothing is left', () => {
    const input = {
      label: 'kept',
      attachments: { tokens: { damage: 1 }, status: { stunned: 1 } },
    };

    expect(
      clearAttachmentKeys(input, ['tokens', 'status', 'modifiers']),
    ).toStrictEqual({ label: 'kept' });
  });

  it('does not mutate its input', () => {
    const input = meta();
    clearAttachmentKeys(input, ['tokens']);

    expect(input).toStrictEqual(meta());
  });

  it('returns the same reference when there is nothing to drop', () => {
    const noAttachments = { label: 'kept' };
    const otherKey = { attachments: { status: { stunned: 1 } } };
    const emptyAttachments = { attachments: {} };

    expect(clearAttachmentKeys(noAttachments, ['tokens'])).toBe(noAttachments);
    expect(clearAttachmentKeys(otherKey, ['tokens'])).toBe(otherKey);
    expect(clearAttachmentKeys(emptyAttachments, ['tokens'])).toBe(
      emptyAttachments,
    );
  });

  it('returns undefined for undefined input', () => {
    expect(clearAttachmentKeys(undefined, ['tokens'])).toBeUndefined();
  });
});

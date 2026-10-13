import type { AttachmentData } from '@cardtable2/shared';

export type ClearableAttachmentKey = 'tokens' | 'status' | 'modifiers';

export const CLEARABLE_ATTACHMENT_KEYS: ReadonlyArray<ClearableAttachmentKey> =
  ['tokens', 'status', 'modifiers'];

type Meta = Record<string, unknown>;

export function clearAttachmentKeys(
  meta: Meta,
  keys: ReadonlyArray<ClearableAttachmentKey>,
): Meta;
export function clearAttachmentKeys(
  meta: Meta | undefined,
  keys: ReadonlyArray<ClearableAttachmentKey>,
): Meta | undefined;
export function clearAttachmentKeys(
  meta: Meta | undefined,
  keys: ReadonlyArray<ClearableAttachmentKey>,
): Meta | undefined {
  const attachments = meta?.attachments as AttachmentData | undefined;
  if (!meta || !attachments || keys.every((key) => !attachments[key])) {
    return meta;
  }

  const remaining = { ...attachments };
  for (const key of keys) {
    delete remaining[key];
  }

  const next = { ...meta };
  if (Object.keys(remaining).length > 0) {
    next.attachments = remaining;
  } else {
    delete next.attachments;
  }
  return next;
}

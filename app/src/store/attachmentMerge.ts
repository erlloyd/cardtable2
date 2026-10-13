import type { AttachmentData, StatusTypeDef } from '@cardtable2/shared';

export type AttachmentMergeChoice = 'merge' | 'target' | 'source';

export function hasAttachments(a: AttachmentData | undefined): boolean {
  if (!a) return false;
  return (
    Object.keys(a.tokens ?? {}).length > 0 ||
    Object.keys(a.status ?? {}).length > 0 ||
    Object.keys(a.modifiers ?? {}).length > 0 ||
    (a.icons ?? []).length > 0
  );
}

function sumCounts(
  a: Record<string, number> | undefined,
  b: Record<string, number> | undefined,
): Record<string, number> {
  const result: Record<string, number> = { ...a };
  for (const [code, count] of Object.entries(b ?? {})) {
    result[code] = (result[code] ?? 0) + count;
  }
  return result;
}

export function mergeAttachments(
  a: AttachmentData,
  b: AttachmentData,
  statusTypes: Record<string, StatusTypeDef> | undefined,
): AttachmentData {
  const tokens = sumCounts(a.tokens, b.tokens);

  const status: Record<string, number> = {};
  for (const [code, count] of Object.entries(sumCounts(a.status, b.status))) {
    status[code] = statusTypes?.[code]?.countable ? count : 1;
  }

  const modifiers = sumCounts(a.modifiers, b.modifiers);
  for (const [code, value] of Object.entries(modifiers)) {
    if (value === 0) delete modifiers[code];
  }

  const icons = [...new Set([...(a.icons ?? []), ...(b.icons ?? [])])];

  const result: AttachmentData = {};
  if (Object.keys(tokens).length > 0) result.tokens = tokens;
  if (Object.keys(status).length > 0) result.status = status;
  if (Object.keys(modifiers).length > 0) result.modifiers = modifiers;
  if (icons.length > 0) result.icons = icons;
  return result;
}

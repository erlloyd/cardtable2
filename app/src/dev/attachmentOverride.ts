/**
 * Dev/test-only attachment direction override.
 *
 * Module-level state that lets a test (or dev console) force the
 * card-on-card attachment direction regardless of what the active plugin
 * declares.  Used to lock in the full pipeline
 * `plugin manifest -> BoardMessageBus -> attachCards ->
 *  computeAttachmentPositions -> _pos` for non-default directions, since
 * no shipped plugin currently sets a non-default `attachmentLayout.direction`
 * (epic ct-2ie shipped 8-direction support but no plugin uses it).
 *
 * Shape
 * -----
 * `getAttachmentDirectionOverride()` returns the current override (or
 * `null` if unset).  It is always shipped — the read site in
 * `attachmentLayout.resolveEffectiveAttachmentLayout` simply reads `null`
 * in production where nothing inside the shipped app calls the setter.
 * The setter is exposed via `__ctDevTools.setAttachmentDirection`, which
 * is reachable from any build (DEV or production-deployed PR previews)
 * but is only invoked manually from the developer console — see
 * `app/src/dev/ctDevTools.ts` and `app/src/main.tsx`.  When `null`, the
 * override path is dead and behavior is identical to today.
 *
 * `setAttachmentDirectionOverride(dir | null)` writes; `null` clears.
 *
 * `__resetAttachmentOverrideForTests()` is a back-door for unit tests so
 * each `it(...)` starts from a known clean state.  Mirrors the
 * `__resetCtDevToolsForTests()` helper in `ctDevTools.ts`.
 */

import type { AttachmentDirection } from '@cardtable2/shared';

let override: AttachmentDirection | null = null;

export function getAttachmentDirectionOverride(): AttachmentDirection | null {
  return override;
}

export function setAttachmentDirectionOverride(
  dir: AttachmentDirection | null,
): void {
  override = dir;
}

/**
 * Test-only helper to reset module state between tests.  Not part of the
 * public surface.
 */
export function __resetAttachmentOverrideForTests(): void {
  override = null;
}

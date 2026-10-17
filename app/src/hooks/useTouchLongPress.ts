import { useCallback, useEffect, useRef } from 'react';
import { dbg } from '../dev/dbg';
import { DRAG_SLOP } from '../renderer/managers/GestureRecognizer';
import type { PointerEventHandlers } from './usePointerEvents';

export const LONG_PRESS_MS = 500;

// Window in which a native `contextmenu` event is treated as the same gesture
// as a long-press we already handled (Android Chrome fires both).
const NATIVE_CONTEXT_MENU_DEDUPE_MS = 1500;

const SWALLOW_CLICK_WINDOW_MS = 400;

interface PendingPress {
  pointerId: number;
  startX: number;
  startY: number;
  lastEvent: React.PointerEvent;
  timer: ReturnType<typeof setTimeout>;
}

export interface TouchLongPress {
  handlers: PointerEventHandlers;
  /**
   * Call from the native `contextmenu` handler. Returns true when the event
   * duplicates a long-press already handled and must be ignored. Otherwise it
   * returns false; if a touch press was still pending (the native event wins),
   * that touch is taken over as if the long-press had fired.
   */
  consumeNativeContextMenu: () => boolean;
}

/**
 * Touch long-press detection layered over the canvas pointer handlers.
 *
 * iOS Safari never fires `contextmenu` on a long-press, so a touch held for
 * LONG_PRESS_MS opens the menu itself. The timer is cancelled by release,
 * pointer-cancel, a second touch (pinch), or movement past the renderer's own
 * touch drag slop (so no drag/pan has started when it fires). When it fires,
 * the renderer is sent `pointer-cancel` for that pointer, which drops its
 * pending drag/pan/selection state; the rest of that touch is then swallowed.
 */
export function useTouchLongPress(
  pointerHandlers: PointerEventHandlers,
  onLongPress: (clientX: number, clientY: number) => void,
): TouchLongPress {
  const pendingRef = useRef<PendingPress | null>(null);
  const firedPointerIdRef = useRef<number | null>(null);
  const lastFiredAtRef = useRef<number | null>(null);

  const handlersRef = useRef(pointerHandlers);
  const onLongPressRef = useRef(onLongPress);
  useEffect(() => {
    handlersRef.current = pointerHandlers;
    onLongPressRef.current = onLongPress;
  });

  const cancelPending = useCallback(() => {
    if (pendingRef.current) {
      clearTimeout(pendingRef.current.timer);
      pendingRef.current = null;
    }
  }, []);

  useEffect(() => cancelPending, [cancelPending]);

  // Chromium synthesizes a click when the long-press finger lifts. By then the
  // menu's click-outside backdrop sits under the finger and would close the
  // menu the instant it opened, so eat that one click.
  const swallowNextClick = useCallback(() => {
    const swallow = (event: MouseEvent) => {
      event.stopPropagation();
      event.preventDefault();
      cleanup();
    };
    const timer = setTimeout(() => cleanup(), SWALLOW_CLICK_WINDOW_MS);
    function cleanup() {
      clearTimeout(timer);
      window.removeEventListener('click', swallow, true);
    }
    window.addEventListener('click', swallow, true);
  }, []);

  // Claim the rest of the pending touch for the menu: the renderer drops its
  // gesture state and the lift (pointer-up + synthesized click) is swallowed.
  const takeOverPending = useCallback((pending: PendingPress) => {
    clearTimeout(pending.timer);
    pendingRef.current = null;
    firedPointerIdRef.current = pending.pointerId;
    lastFiredAtRef.current = Date.now();
    handlersRef.current.onPointerCancel(pending.lastEvent);
  }, []);

  const fire = useCallback(() => {
    const pending = pendingRef.current;
    if (!pending) return;

    dbg('input', 'long-press fired at', pending.startX, pending.startY);
    takeOverPending(pending);
    onLongPressRef.current(pending.startX, pending.startY);
  }, [takeOverPending]);

  const onPointerDown = useCallback(
    (event: React.PointerEvent) => {
      if (event.pointerType !== 'touch') {
        handlersRef.current.onPointerDown(event);
        return;
      }

      // A second touch means pinch/pan, never a long-press.
      cancelPending();

      handlersRef.current.onPointerDown(event);

      if (event.isPrimary) {
        firedPointerIdRef.current = null;
        pendingRef.current = {
          pointerId: event.pointerId,
          startX: event.clientX,
          startY: event.clientY,
          lastEvent: event,
          timer: setTimeout(fire, LONG_PRESS_MS),
        };
      }
    },
    [cancelPending, fire],
  );

  const onPointerMove = useCallback(
    (event: React.PointerEvent) => {
      if (event.pointerId === firedPointerIdRef.current) return;

      const pending = pendingRef.current;
      if (pending && pending.pointerId === event.pointerId) {
        const slop = DRAG_SLOP.touch / (window.devicePixelRatio || 1);
        const moved = Math.hypot(
          event.clientX - pending.startX,
          event.clientY - pending.startY,
        );
        if (moved > slop) {
          cancelPending();
        } else {
          pending.lastEvent = event;
        }
      }
      handlersRef.current.onPointerMove(event);
    },
    [cancelPending],
  );

  const onPointerUp = useCallback(
    (event: React.PointerEvent) => {
      if (event.pointerId === firedPointerIdRef.current) {
        firedPointerIdRef.current = null;
        swallowNextClick();
        return;
      }
      if (pendingRef.current?.pointerId === event.pointerId) cancelPending();
      handlersRef.current.onPointerUp(event);
    },
    [cancelPending, swallowNextClick],
  );

  const onPointerCancel = useCallback(
    (event: React.PointerEvent) => {
      if (event.pointerId === firedPointerIdRef.current) {
        firedPointerIdRef.current = null;
        return;
      }
      if (pendingRef.current?.pointerId === event.pointerId) cancelPending();
      handlersRef.current.onPointerCancel(event);
    },
    [cancelPending],
  );

  const consumeNativeContextMenu = useCallback(() => {
    const firedAt = lastFiredAtRef.current;
    if (
      firedAt !== null &&
      Date.now() - firedAt < NATIVE_CONTEXT_MENU_DEDUPE_MS
    ) {
      return true;
    }
    // Native event beat our timer: Board opens the menu, so take over the touch
    // exactly as fire() would.
    const pending = pendingRef.current;
    if (pending) takeOverPending(pending);
    return false;
  }, [takeOverPending]);

  return {
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel,
      onPointerLeave: pointerHandlers.onPointerLeave,
    },
    consumeNativeContextMenu,
  };
}

export type ToastKind = 'info' | 'error';

export interface Toast {
  readonly id: number;
  readonly message: string;
  readonly kind: ToastKind;
}

export const TOAST_DURATION_MS = 6000;

let toasts: readonly Toast[] = [];
let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();

function setToasts(next: readonly Toast[]): void {
  toasts = next;
  for (const listener of [...listeners]) {
    listener();
  }
}

export function showToast(message: string, kind: ToastKind = 'info'): void {
  const id = nextId++;
  timers.set(
    id,
    setTimeout(() => dismissToast(id), TOAST_DURATION_MS),
  );
  setToasts([...toasts, { id, message, kind }]);
}

export function dismissToast(id: number): void {
  if (!toasts.some((t) => t.id === id)) {
    return;
  }
  clearTimeout(timers.get(id));
  timers.delete(id);
  setToasts(toasts.filter((t) => t.id !== id));
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getToasts(): readonly Toast[] {
  return toasts;
}

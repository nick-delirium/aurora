export interface ToastAction {
  label: string;
  run: () => void;
}

export interface Toast {
  id: number;
  message: string;
  action?: ToastAction;
}

export const toasts: Toast[] = $state([]);

let next = 0;

export function dismiss(id: number): void {
  const i = toasts.findIndex((t) => t.id === id);
  if (i >= 0) toasts.splice(i, 1);
}

/** Show a toast; with an action it stays a little longer so there's time to tap it. */
export function toast(message: string, options: { action?: ToastAction; ms?: number } = {}): void {
  const id = ++next;
  toasts.push({ id, message, action: options.action });
  setTimeout(() => dismiss(id), options.ms ?? (options.action ? 5000 : 2600));
}

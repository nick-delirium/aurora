export interface Toast {
  id: number;
  message: string;
}

export const toasts: Toast[] = $state([]);

let next = 0;

export function toast(message: string, ms = 2600): void {
  const id = ++next;
  toasts.push({ id, message });
  setTimeout(() => {
    const i = toasts.findIndex((t) => t.id === id);
    if (i >= 0) toasts.splice(i, 1);
  }, ms);
}

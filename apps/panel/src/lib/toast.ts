export type ToastTone = 'slate' | 'green' | 'amber' | 'red' | 'blue';

export type ToastItem = {
  id: string;
  message: string;
  tone: ToastTone;
};

const EVT = 'panel:toast';

export function toast(message: string, tone: ToastTone = 'slate') {
  const detail: ToastItem = {
    id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
    message,
    tone
  };
  window.dispatchEvent(new CustomEvent(EVT, { detail }));
}

export function onToast(cb: (t: ToastItem) => void) {
  const handler = (e: Event) => cb((e as CustomEvent).detail as ToastItem);
  window.addEventListener(EVT, handler);
  return () => window.removeEventListener(EVT, handler);
}

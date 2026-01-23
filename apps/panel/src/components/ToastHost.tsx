import React, { useEffect, useState } from 'react';
import clsx from 'clsx';
import { onToast, ToastItem } from '../lib/toast';

export default function ToastHost() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    return onToast((t) => {
      setItems((prev: ToastItem[]) => [t, ...prev].slice(0, 4));
      // auto-remove
      setTimeout(() => {
        setItems((prev: ToastItem[]) => prev.filter((x: ToastItem) => x.id !== t.id));
      }, 4000);
    });
  }, []);

  const toneCls: Record<string, string> = {
    slate: 'bg-slate-950/90 ring-slate-800 text-slate-100',
    green: 'bg-emerald-950/90 ring-emerald-800 text-emerald-100',
    amber: 'bg-amber-950/90 ring-amber-800 text-amber-100',
    red: 'bg-rose-950/90 ring-rose-800 text-rose-100',
    blue: 'bg-sky-950/90 ring-sky-800 text-sky-100'
  };

  if (items.length === 0) return null;

  return (
    <div className="fixed top-4 right-4 z-50 w-[360px] max-w-[90vw] space-y-2">
      {items.map((t) => (
        <div
          key={t.id}
          className={clsx(
            'rounded-2xl ring-1 px-3 py-2 shadow-lg',
            toneCls[t.tone] || toneCls.slate
          )}
        >
          <div className="flex items-start justify-between gap-2">
            <div className="text-sm leading-snug whitespace-pre-wrap">{t.message}</div>
            <button
              className="text-xs opacity-70 hover:opacity-100"
              onClick={() => setItems((prev: ToastItem[]) => prev.filter((x: ToastItem) => x.id !== t.id))}
            >
              ✕
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

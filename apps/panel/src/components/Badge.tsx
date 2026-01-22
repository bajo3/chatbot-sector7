import React from 'react';
import clsx from 'clsx';

export default function Badge({ children, tone='slate' }: { children: React.ReactNode; tone?: 'slate'|'green'|'amber'|'red'|'blue' }) {
  const cls = {
    slate: 'bg-slate-800/70 text-slate-200 ring-slate-700',
    green: 'bg-emerald-900/50 text-emerald-200 ring-emerald-800',
    amber: 'bg-amber-900/40 text-amber-200 ring-amber-800',
    red: 'bg-rose-900/40 text-rose-200 ring-rose-800',
    blue: 'bg-sky-900/40 text-sky-200 ring-sky-800'
  }[tone];
  return (
    <span className={clsx('inline-flex items-center px-2 py-0.5 rounded-full text-xs ring-1', cls)}>
      {children}
    </span>
  );
}

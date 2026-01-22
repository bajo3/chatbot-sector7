import React from 'react';
import clsx from 'clsx';

export default function Button({
  children, onClick, tone='slate', disabled, className
}: {
  children: React.ReactNode;
  onClick?: () => void;
  tone?: 'slate'|'green'|'amber'|'red'|'blue';
  disabled?: boolean;
  className?: string;
}) {
  const cls = {
    slate: 'bg-slate-800 hover:bg-slate-700 text-slate-100 ring-slate-700',
    green: 'bg-emerald-700 hover:bg-emerald-600 text-white ring-emerald-500/40',
    amber: 'bg-amber-700 hover:bg-amber-600 text-white ring-amber-500/40',
    red: 'bg-rose-700 hover:bg-rose-600 text-white ring-rose-500/40',
    blue: 'bg-sky-700 hover:bg-sky-600 text-white ring-sky-500/40'
  }[tone];
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={clsx(
        'px-3 py-2 rounded-xl text-sm font-medium ring-1 transition disabled:opacity-50 disabled:cursor-not-allowed',
        cls,
        className
      )}
    >
      {children}
    </button>
  );
}

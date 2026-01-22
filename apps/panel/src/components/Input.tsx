import React from 'react';
import clsx from 'clsx';

export default function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={clsx(
        'w-full px-3 py-2 rounded-xl bg-slate-900/60 ring-1 ring-slate-800 focus:outline-none focus:ring-slate-600 text-slate-100',
        props.className
      )}
    />
  );
}

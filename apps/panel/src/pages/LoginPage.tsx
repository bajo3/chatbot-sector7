import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Input from '../components/Input';
import Button from '../components/Button';
import { login } from '../lib/api';

export default function LoginPage() {
  const nav = useNavigate();
  const [email, setEmail] = useState('admin@sector7.local');
  const [password, setPassword] = useState('admin123');
  const [err, setErr] = useState('');

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    try {
      const res = await login(email, password);
      localStorage.setItem('token', res.token);
      localStorage.setItem('user', JSON.stringify(res.user));
      nav('/');
    } catch (e: any) {
      setErr(e.message || 'Error');
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl bg-slate-900/60 ring-1 ring-slate-800 p-6">
        <div className="text-xl font-semibold">Panel Sector 7</div>
        <div className="text-slate-400 text-sm mt-1">Ingresá para ver chats y tomar conversaciones.</div>

        <form onSubmit={onSubmit} className="mt-6 space-y-3">
          <div>
            <div className="text-xs text-slate-400 mb-1">Email</div>
            <Input value={email} onChange={e=>setEmail(e.target.value)} />
          </div>
          <div>
            <div className="text-xs text-slate-400 mb-1">Password</div>
            <Input type="password" value={password} onChange={e=>setPassword(e.target.value)} />
          </div>
          {err && <div className="text-rose-300 text-sm">{err}</div>}
          <Button tone="blue" className="w-full">Entrar</Button>

          <div className="text-xs text-slate-500 mt-2">
            Demo: admin@sector7.local / admin123
          </div>
        </form>
      </div>
    </div>
  );
}

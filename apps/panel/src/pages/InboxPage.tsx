import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { socket } from '../lib/socket';
import Badge from '../components/Badge';
import Input from '../components/Input';
import Button from '../components/Button';

type Convo = {
  id: string;
  waFrom: string;
  state: 'BOT_ON'|'HUMAN_TAKEOVER';
  leadStatus: string;
  intentScore: number;
  updatedAt: string;
  assignedUser?: { id: string; name: string } | null;
};

export default function InboxPage() {
  const nav = useNavigate();
  const [items, setItems] = useState<Convo[]>([]);
  const [q, setQ] = useState('');
  const [state, setState] = useState<'all'|'BOT_ON'|'HUMAN_TAKEOVER'>('all');

  async function load() {
    const qs = new URLSearchParams();
    if (q.trim()) qs.set('q', q.trim());
    if (state !== 'all') qs.set('state', state);
    const res = await api<Convo[]>(`/api/conversations?${qs.toString()}`);
    setItems(res);
  }

  useEffect(() => { load().catch(console.error); }, []);
  useEffect(() => {
    const onUpdate = () => load().catch(console.error);
    socket.on('conversation:updated', onUpdate);
    socket.on('message:new', onUpdate);
    return () => {
      socket.off('conversation:updated', onUpdate);
      socket.off('message:new', onUpdate);
    };
  }, [q, state]);

  const user = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('user')||'{}'); } catch { return {}; }
  }, []);

  function toneForLead(s: string) {
    if (s === 'HOT') return 'red';
    if (s === 'HOT_WAITING') return 'amber';
    if (s === 'HOT_LOST') return 'slate';
    if (s === 'WARM') return 'amber';
    return 'slate';
  }

  return (
    <div className="min-h-screen p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">Inbox WhatsApp</div>
          <div className="text-sm text-slate-400">Un solo número • varios vendedores • bot/humano sin que el cliente lo note</div>
        </div>
        <div className="flex gap-2">
          <Button tone="slate" onClick={() => { localStorage.removeItem('token'); localStorage.removeItem('user'); nav('/login'); }}>
            Salir
          </Button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-4">
          <Input placeholder="Buscar por número / waFrom..." value={q} onChange={e=>setQ(e.target.value)} />
        </div>
        <div className="md:col-span-3">
          <select value={state} onChange={e=>setState(e.target.value as any)}
            className="w-full px-3 py-2 rounded-xl bg-slate-900/60 ring-1 ring-slate-800 text-slate-100">
            <option value="all">Todos</option>
            <option value="BOT_ON">BOT_ON</option>
            <option value="HUMAN_TAKEOVER">HUMAN_TAKEOVER</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <Button tone="blue" className="w-full" onClick={()=>load().catch(console.error)}>Actualizar</Button>
        </div>
        <div className="md:col-span-3 flex items-center justify-end text-sm text-slate-400">
          {user?.name ? `Logueado: ${user.name}` : ''}
        </div>
      </div>

      <div className="mt-5 rounded-3xl ring-1 ring-slate-800 bg-slate-900/40 overflow-hidden">
        <div className="grid grid-cols-12 px-4 py-3 text-xs text-slate-400 border-b border-slate-800">
          <div className="col-span-3">Cliente</div>
          <div className="col-span-2">Estado</div>
          <div className="col-span-2">Lead</div>
          <div className="col-span-2">Score</div>
          <div className="col-span-3">Asignado</div>
        </div>

        <div className="max-h-[70vh] overflow-auto">
          {items.map(c => (
            <button
              key={c.id}
              onClick={()=>nav(`/c/${c.id}`)}
              className="w-full text-left grid grid-cols-12 px-4 py-3 border-b border-slate-800 hover:bg-slate-900/70 transition"
            >
              <div className="col-span-3 font-medium">{c.waFrom}</div>
              <div className="col-span-2"><Badge tone={c.state==='HUMAN_TAKEOVER' ? 'blue':'slate'}>{c.state}</Badge></div>
              <div className="col-span-2"><Badge tone={toneForLead(c.leadStatus) as any}>{c.leadStatus}</Badge></div>
              <div className="col-span-2 text-slate-300">{c.intentScore}</div>
              <div className="col-span-3 text-slate-300">{c.assignedUser?.name || '—'}</div>
            </button>
          ))}
          {items.length===0 && <div className="p-6 text-slate-400">No hay conversaciones todavía.</div>}
        </div>
      </div>
    </div>
  );
}

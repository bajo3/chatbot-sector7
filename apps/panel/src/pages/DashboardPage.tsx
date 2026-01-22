import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import Button from '../components/Button';
import Badge from '../components/Badge';

type Summary = {
  windowDays: number;
  since: string;
  totalConversations: number;
  openTakeovers: number;
  byLeadStatus: { leadStatus: string; _count: { _all: number } }[];
  byState: { state: string; _count: { _all: number } }[];
  avgFirstResponseSec: number | null;
};

type User = { id: string; name: string; email: string; role: string; isOnline: boolean };

function fmtSeconds(s: number | null) {
  if (s == null) return '—';
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${Math.round(s/60)}m`;
  return `${(s/3600).toFixed(1)}h`;
}

export default function DashboardPage() {
  const nav = useNavigate();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [days, setDays] = useState(7);

  const me = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('user')||'{}'); } catch { return {}; }
  }, []);

  async function load() {
    const s = await api<Summary>(`/api/metrics/summary?days=${days}`);
    const u = await api<User[]>(`/api/users`);
    setSummary(s);
    setUsers(u);
  }

  useEffect(() => { load().catch(console.error); }, [days]);

  async function setOnline(isOnline: boolean) {
    if (!me?.id) return;
    await api(`/api/users/${me.id}/online`, { method:'POST', body: JSON.stringify({ isOnline }) });
    await load();
  }

  return (
    <div className="min-h-screen p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">Dashboard</div>
          <div className="text-sm text-slate-400">Indicadores rápidos + estado del equipo</div>
        </div>
        <div className="flex gap-2">
          <Button tone="slate" onClick={()=>nav('/')}>Inbox</Button>
          <Button tone="slate" onClick={()=>{ localStorage.removeItem('token'); localStorage.removeItem('user'); nav('/login'); }}>Salir</Button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-2">
          <select value={days} onChange={e=>setDays(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-xl bg-slate-900/60 ring-1 ring-slate-800 text-slate-100">
            <option value={1}>Hoy (1d)</option>
            <option value={7}>7 días</option>
            <option value={14}>14 días</option>
            <option value={30}>30 días</option>
          </select>
        </div>
        <div className="md:col-span-5 flex items-center gap-2 text-sm text-slate-300">
          <span>Mi estado:</span>
          <Badge tone={users.find(u=>u.id===me?.id)?.isOnline ? 'green' : 'slate'}>
            {users.find(u=>u.id===me?.id)?.isOnline ? 'ONLINE' : 'OFFLINE'}
          </Badge>
          <Button tone="green" onClick={()=>setOnline(true)}>Online</Button>
          <Button tone="slate" onClick={()=>setOnline(false)}>Offline</Button>
        </div>
        <div className="md:col-span-5 flex items-center justify-end">
          <Button tone="blue" onClick={()=>load().catch(console.error)}>Actualizar</Button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-3xl bg-slate-900/40 ring-1 ring-slate-800 p-4">
            <div className="text-sm text-slate-400">Conversaciones (ventana)</div>
            <div className="text-2xl font-semibold mt-1">{summary?.totalConversations ?? '—'}</div>
          </div>
          <div className="rounded-3xl bg-slate-900/40 ring-1 ring-slate-800 p-4">
            <div className="text-sm text-slate-400">Handoff activos</div>
            <div className="text-2xl font-semibold mt-1">{summary?.openTakeovers ?? '—'}</div>
          </div>
          <div className="rounded-3xl bg-slate-900/40 ring-1 ring-slate-800 p-4">
            <div className="text-sm text-slate-400">1ª respuesta promedio</div>
            <div className="text-2xl font-semibold mt-1">{fmtSeconds(summary?.avgFirstResponseSec ?? null)}</div>
          </div>

          <div className="md:col-span-3 rounded-3xl bg-slate-900/40 ring-1 ring-slate-800 p-4">
            <div className="font-semibold">Leads por estado</div>
            <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
              {(summary?.byLeadStatus || []).map(x => (
                <div key={x.leadStatus} className="rounded-2xl bg-slate-950/30 ring-1 ring-slate-800 p-3">
                  <div className="text-xs text-slate-400">{x.leadStatus}</div>
                  <div className="text-lg font-semibold">{x._count._all}</div>
                </div>
              ))}
              {(summary?.byLeadStatus?.length || 0) === 0 && <div className="text-sm text-slate-400">Sin datos</div>}
            </div>
          </div>
        </div>

        <div className="lg:col-span-4 rounded-3xl bg-slate-900/40 ring-1 ring-slate-800 p-4">
          <div className="font-semibold">Equipo</div>
          <div className="text-xs text-slate-400 mt-1">Online/offline afecta el auto-asignado del handoff.</div>
          <div className="mt-3 space-y-2">
            {users.map(u => (
              <div key={u.id} className="flex items-center justify-between rounded-2xl bg-slate-950/30 ring-1 ring-slate-800 p-3">
                <div>
                  <div className="text-sm font-medium text-slate-100">{u.name}</div>
                  <div className="text-xs text-slate-400">{u.role}</div>
                </div>
                <Badge tone={u.isOnline ? 'green' : 'slate'}>{u.isOnline ? 'ONLINE' : 'OFFLINE'}</Badge>
              </div>
            ))}
            {users.length===0 && <div className="text-sm text-slate-400">Sin usuarios</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

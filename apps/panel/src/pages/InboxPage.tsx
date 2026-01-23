import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { disconnectSocket, socket } from '../lib/socket';
import Badge from '../components/Badge';
import Input from '../components/Input';
import Button from '../components/Button';
import { clearAuth, getUser } from '../lib/auth';
import { toast } from '../lib/toast';

type LastMessage = {
  id: string;
  sender: string;
  type: string;
  text?: string | null;
  mediaUrl?: string | null;
  timestamp: string;
  direction: 'IN' | 'OUT';
};

type Convo = {
  id: string;
  waFrom: string;
  state: 'BOT_ON' | 'HUMAN_TAKEOVER';
  leadStatus: string;
  intentScore: number;
  updatedAt: string;
  botPausedUntil?: string | null;
  assignedUser?: { id: string; name: string } | null;
  lastMessage?: LastMessage | null;
};

function fmtShort(dt: string) {
  const t = new Date(dt).getTime();
  const now = Date.now();
  const d = Math.max(0, Math.floor((now - t) / 1000));
  if (d < 60) return `${d}s`;
  if (d < 3600) return `${Math.floor(d / 60)}m`;
  if (d < 86400) return `${Math.floor(d / 3600)}h`;
  return `${Math.floor(d / 86400)}d`;
}

function seenKey(id: string) {
  return `seen:${id}`;
}

function getSeenAt(id: string): number {
  const raw = localStorage.getItem(seenKey(id));
  const n = raw ? Number(raw) : 0;
  return Number.isFinite(n) ? n : 0;
}

export default function InboxPage() {
  const nav = useNavigate();
  const me = useMemo(() => getUser(), []);

  const [items, setItems] = useState<Convo[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string>('');

  const [q, setQ] = useState('');
  const [state, setState] = useState<'all' | 'BOT_ON' | 'HUMAN_TAKEOVER'>('all');
  const [assigned, setAssigned] = useState<'all' | 'me' | 'unassigned'>('all');
  const [leadStatus, setLeadStatus] = useState<'all' | string>('all');

  async function load(opts: { silent?: boolean } = {}) {
    const qs = new URLSearchParams();
    if (q.trim()) qs.set('q', q.trim());
    if (state !== 'all') qs.set('state', state);
    if (assigned !== 'all') qs.set('assigned', assigned);
    if (leadStatus !== 'all') qs.set('leadStatus', leadStatus);

    setErr('');
    if (!opts.silent) setLoading(true);
    try {
      const res = await api<Convo[]>(`/api/conversations?${qs.toString()}`);
      setItems(res);
    } catch (e: any) {
      setErr(e.message || 'Error');
      toast(e.message || 'Error cargando conversaciones', 'red');
    } finally {
      if (!opts.silent) setLoading(false);
    }
  }

  // initial load
  useEffect(() => {
    load().catch(console.error);
  }, []);

  // debounce filters
  useEffect(() => {
    const t = setTimeout(() => {
      load({ silent: true }).catch(console.error);
    }, 250);
    return () => clearTimeout(t);
  }, [q, state, assigned, leadStatus]);

  // realtime
  useEffect(() => {
    const onUpdate = (payload: any) => {
      if (!payload?.conversationId) return;
      // lightweight refresh (keeps UI responsive)
      load({ silent: true }).catch(console.error);
    };
    socket.on('conversation:updated', onUpdate);
    socket.on('message:new', onUpdate);
    return () => {
      socket.off('conversation:updated', onUpdate);
      socket.off('message:new', onUpdate);
    };
  }, [q, state, assigned, leadStatus]);

  function toneForLead(s: string) {
    if (s === 'HOT') return 'red';
    if (s === 'HOT_WAITING') return 'amber';
    if (s === 'HOT_LOST') return 'slate';
    if (s === 'WARM') return 'amber';
    return 'slate';
  }

  function lastLine(c: Convo) {
    const lm = c.lastMessage;
    if (!lm) return '—';
    const prefix = lm.sender === 'CUSTOMER' ? 'Cliente: ' : lm.sender === 'HUMAN' ? 'Vendedor: ' : 'Bot: ';
    const body = lm.type === 'TEXT' ? (lm.text || '') : `[${lm.type}]`;
    const text = (prefix + body).trim();
    return text.length > 80 ? text.slice(0, 80) + '…' : text;
  }

  function isUnread(c: Convo) {
    const seen = getSeenAt(c.id);
    const ts = c.lastMessage?.timestamp ? new Date(c.lastMessage.timestamp).getTime() : new Date(c.updatedAt).getTime();
    return ts > seen;
  }

  function logout() {
    clearAuth();
    disconnectSocket();
    nav('/login');
  }

  const unreadCount = items.reduce((acc, c) => acc + (isUnread(c) ? 1 : 0), 0);

  return (
    <div className="min-h-screen p-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xl font-semibold">Inbox WhatsApp</div>
          <div className="text-sm text-slate-400">
            {loading ? 'Actualizando…' : `Conversaciones: ${items.length} • Sin leer: ${unreadCount}`}
          </div>
        </div>
        <div className="flex gap-2">
          <Button tone="slate" onClick={() => nav('/dashboard')}>Dashboard</Button>
          <Button tone="slate" onClick={logout}>Salir</Button>
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-3">
          <Input placeholder="Buscar por número / waFrom…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="md:col-span-3">
          <select
            value={state}
            onChange={(e) => setState(e.target.value as any)}
            className="w-full px-3 py-2 rounded-xl bg-slate-900/60 ring-1 ring-slate-800 text-slate-100"
          >
            <option value="all">Todos</option>
            <option value="BOT_ON">BOT_ON</option>
            <option value="HUMAN_TAKEOVER">HUMAN_TAKEOVER</option>
          </select>
        </div>
        <div className="md:col-span-3">
          <select
            value={assigned}
            onChange={(e) => setAssigned(e.target.value as any)}
            className="w-full px-3 py-2 rounded-xl bg-slate-900/60 ring-1 ring-slate-800 text-slate-100"
          >
            <option value="all">Asignación: todas</option>
            <option value="me">Asignadas a mí</option>
            <option value="unassigned">Sin asignar</option>
          </select>
        </div>
        <div className="md:col-span-3">
          <select
            value={leadStatus}
            onChange={(e) => setLeadStatus(e.target.value as any)}
            className="w-full px-3 py-2 rounded-xl bg-slate-900/60 ring-1 ring-slate-800 text-slate-100"
          >
            <option value="all">Lead: todos</option>
            <option value="NEW">NEW</option>
            <option value="COLD">COLD</option>
            <option value="WARM">WARM</option>
            <option value="HOT_WAITING">HOT_WAITING</option>
            <option value="HOT">HOT</option>
            <option value="HUMAN">HUMAN</option>
            <option value="HOT_LOST">HOT_LOST</option>
            <option value="CLOSED_WON">CLOSED_WON</option>
            <option value="CLOSED_LOST">CLOSED_LOST</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <Button tone="blue" className="w-full" onClick={() => load().catch(console.error)} disabled={loading}>
            {loading ? '…' : 'Actualizar'}
          </Button>
        </div>
        <div className="md:col-span-4 flex items-center justify-end text-sm text-slate-400">
          {me?.name ? `Logueado: ${me.name}` : ''}
        </div>
      </div>

      {err && (
        <div className="mt-4 rounded-2xl bg-rose-950/40 ring-1 ring-rose-900 px-4 py-3 text-rose-200">
          {err}
        </div>
      )}

      <div className="mt-5 rounded-3xl ring-1 ring-slate-800 bg-slate-900/40 overflow-hidden">
        <div className="grid grid-cols-12 px-4 py-3 text-xs text-slate-400 border-b border-slate-800">
          <div className="col-span-6">Cliente</div>
          <div className="col-span-6 text-right">Estado</div>
        </div>

        <div className="max-h-[70vh] overflow-auto">
          {items.map((c) => {
            const paused = c.botPausedUntil && new Date(c.botPausedUntil).getTime() > Date.now();
            const unread = isUnread(c);
            return (
              <button
                key={c.id}
                onClick={() => nav(`/c/${c.id}`)}
                className="w-full text-left px-4 py-3 border-b border-slate-800 hover:bg-slate-900/70 transition"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <div className="font-medium truncate">{c.waFrom}</div>
                      {unread && <span className="inline-block h-2 w-2 rounded-full bg-sky-400" />}
                    </div>
                    <div className="text-sm text-slate-300 mt-1 truncate">{lastLine(c)}</div>
                    <div className="text-xs text-slate-500 mt-1">
                      {c.lastMessage?.timestamp ? `Hace ${fmtShort(c.lastMessage.timestamp)}` : `Hace ${fmtShort(c.updatedAt)}`}
                      {c.assignedUser?.name ? ` • ${c.assignedUser.name}` : ''}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2">
                    {paused && <Badge tone="amber">PAUSADO</Badge>}
                    <Badge tone={c.state === 'HUMAN_TAKEOVER' ? 'blue' : 'slate'}>{c.state}</Badge>
                    <Badge tone={toneForLead(c.leadStatus) as any}>{c.leadStatus}</Badge>
                    <div className="text-xs text-slate-400">Score {c.intentScore}</div>
                  </div>
                </div>
              </button>
            );
          })}

          {items.length === 0 && (
            <div className="p-6 text-slate-400">
              {loading ? 'Cargando…' : 'No hay conversaciones todavía.'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { socket } from '../lib/socket';
import Button from '../components/Button';
import Badge from '../components/Badge';
import Input from '../components/Input';
import { getUser } from '../lib/auth';
import { toast } from '../lib/toast';

type Convo = {
  id: string;
  waFrom: string;
  state: 'BOT_ON' | 'HUMAN_TAKEOVER';
  leadStatus: string;
  intentScore: number;
  assignedUserId?: string | null;
  assignedUser?: { id: string; name: string } | null;
  botPausedUntil?: string | null;
  lastCustomerMsgAt?: string | null;
  lastHumanMsgAt?: string | null;
  lastBotMsgAt?: string | null;
};

type Msg = {
  id: string;
  direction: 'IN' | 'OUT';
  sender: 'CUSTOMER' | 'BOT' | 'HUMAN' | 'SYSTEM';
  type?: string;
  text?: string | null;
  mediaUrl?: string | null;
  timestamp: string;
};

type Note = {
  id: string;
  text: string;
  createdAt: string;
  user?: { name: string };
};

type Event = {
  id: string;
  kind: string;
  payload: any;
  createdAt: string;
};

type User = { id: string; name: string; role: string };

function seenKey(id: string) {
  return `seen:${id}`;
}

function markSeen(id: string) {
  localStorage.setItem(seenKey(id), String(Date.now()));
}

function fmtTime(dt: string) {
  const d = new Date(dt);
  return d.toLocaleString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function fmtDateTime(dt: string) {
  const d = new Date(dt);
  return d.toLocaleString();
}

function isActivePause(until?: string | null) {
  if (!until) return false;
  return new Date(until).getTime() > Date.now();
}

export default function ChatPage() {
  const { id } = useParams();
  const nav = useNavigate();

  const me = useMemo(() => getUser(), []);

  const [convo, setConvo] = useState<Convo | null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [notes, setNotes] = useState<Note[]>([]);
  const [users, setUsers] = useState<User[]>([]);

  const [text, setText] = useState('');
  const [noteText, setNoteText] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(false);

  const listRef = useRef<HTMLDivElement | null>(null);
  const [stickToBottom, setStickToBottom] = useState(true);

  async function load(opts: { silent?: boolean } = {}) {
    if (!id) return;
    if (!opts.silent) setLoading(true);
    try {
      const [c, m, n, u, e] = await Promise.all([
        api<Convo>(`/api/conversations/${id}`),
        api<Msg[]>(`/api/conversations/${id}/messages`),
        api<Note[]>(`/api/conversations/${id}/notes`),
        api<User[]>(`/api/users`),
        api<Event[]>(`/api/conversations/${id}/events`)
      ]);
      setConvo(c);
      setMsgs(m);
      setNotes(n);
      setUsers(u);
      setEvents(e);
      markSeen(id);
    } catch (e: any) {
      toast(e.message || 'Error cargando conversación', 'red');
    } finally {
      if (!opts.silent) setLoading(false);
    }
  }

  useEffect(() => {
    load().catch(console.error);
  }, [id]);

  // realtime refresh for this convo
  useEffect(() => {
    const onUpdate = (payload: any) => {
      if (payload?.conversationId === id) load({ silent: true }).catch(console.error);
    };
    socket.on('conversation:updated', onUpdate);
    socket.on('message:new', onUpdate);
    return () => {
      socket.off('conversation:updated', onUpdate);
      socket.off('message:new', onUpdate);
    };
  }, [id]);

  // autoscroll
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (stickToBottom) {
      el.scrollTop = el.scrollHeight;
    }
  }, [msgs, stickToBottom]);

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      setStickToBottom(distance < 160);
    };
    el.addEventListener('scroll', onScroll);
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  async function send() {
    if (!id) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    setSending(true);
    const optimistic: Msg = {
      id: `tmp-${Date.now()}`,
      direction: 'OUT',
      sender: 'HUMAN',
      type: 'TEXT',
      text: trimmed,
      timestamp: new Date().toISOString()
    };
    setMsgs((prev: Msg[]) => [...prev, optimistic]);
    setText('');
    setStickToBottom(true);

    try {
      await api(`/api/conversations/${id}/send`, {
        method: 'POST',
        body: JSON.stringify({ text: trimmed })
      });
      await load({ silent: true });
      toast('Mensaje enviado', 'green');
    } catch (e: any) {
      toast(e.message || 'Error enviando mensaje', 'red');
      // revert optimistic if failed
      setMsgs((prev: Msg[]) => prev.filter((m: Msg) => m.id !== optimistic.id));
      setText(trimmed);
    } finally {
      setSending(false);
    }
  }

  async function takeover(userId?: string) {
    if (!id) return;
    try {
      await api(`/api/conversations/${id}/takeover`, {
        method: 'POST',
        body: JSON.stringify(userId ? { userId } : {})
      });
      toast('Handoff activado', 'blue');
      await load({ silent: true });
    } catch (e: any) {
      toast(e.message || 'Error', 'red');
    }
  }

  async function returnToBot() {
    if (!id) return;
    try {
      await api(`/api/conversations/${id}/return-to-bot`, {
        method: 'POST',
        body: JSON.stringify({ silent: true })
      });
      toast('Bot reactivado (silencioso)', 'green');
      await load({ silent: true });
    } catch (e: any) {
      toast(e.message || 'Error', 'red');
    }
  }

  async function pauseBot(minutes: number) {
    if (!id) return;
    try {
      await api(`/api/conversations/${id}/pause-bot`, {
        method: 'POST',
        body: JSON.stringify({ minutes })
      });
      toast(`Bot pausado ${minutes}m`, 'amber');
      await load({ silent: true });
    } catch (e: any) {
      toast(e.message || 'Error', 'red');
    }
  }

  async function resumeBot() {
    if (!id) return;
    try {
      await api(`/api/conversations/${id}/resume-bot`, { method: 'POST', body: JSON.stringify({}) });
      toast('Bot reanudado', 'green');
      await load({ silent: true });
    } catch (e: any) {
      toast(e.message || 'Error', 'red');
    }
  }

  async function addNote() {
    if (!id) return;
    const trimmed = noteText.trim();
    if (!trimmed) return;
    try {
      await api(`/api/conversations/${id}/note`, {
        method: 'POST',
        body: JSON.stringify({ text: trimmed })
      });
      setNoteText('');
      toast('Nota agregada', 'amber');
      await load({ silent: true });
    } catch (e: any) {
      toast(e.message || 'Error', 'red');
    }
  }

  const paused = isActivePause(convo?.botPausedUntil);

  return (
    <div className="min-h-screen p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button tone="slate" onClick={() => nav('/')}>← Inbox</Button>
          <Button tone="slate" onClick={() => nav('/dashboard')}>Dashboard</Button>
          <div>
            <div className="text-lg font-semibold">{convo?.waFrom || '...'}</div>
            <div className="text-xs text-slate-400">ID: {id} {loading ? '• cargando…' : ''}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {convo && <Badge tone={convo.state === 'HUMAN_TAKEOVER' ? 'blue' : 'slate'}>{convo.state}</Badge>}
          {paused && <Badge tone="amber">BOT PAUSADO</Badge>}
          {convo && (
            <Badge tone={convo.leadStatus === 'HOT' ? 'red' : convo.leadStatus === 'WARM' ? 'amber' : 'slate'}>
              {convo.leadStatus}
            </Badge>
          )}
          {convo && <div className="text-sm text-slate-300">Score: {convo.intentScore}</div>}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 rounded-3xl bg-slate-900/40 ring-1 ring-slate-800 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm text-slate-300 truncate">
                Asignado: <span className="text-slate-100 font-medium">{convo?.assignedUser?.name || '—'}</span>
              </div>
              <div className="text-xs text-slate-500 mt-0.5">
                {convo?.lastCustomerMsgAt ? `Últ. cliente: ${fmtDateTime(convo.lastCustomerMsgAt)}` : 'Últ. cliente: —'}
                {' • '}
                {convo?.lastHumanMsgAt ? `Últ. humano: ${fmtDateTime(convo.lastHumanMsgAt)}` : 'Últ. humano: —'}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 justify-end">
              <Button tone="blue" onClick={() => takeover()} disabled={loading}>Tomar</Button>
              <Button tone="slate" onClick={returnToBot} disabled={loading}>Devolver al bot</Button>
              <Button tone="amber" onClick={() => pauseBot(60)} disabled={loading}>Pausar 1h</Button>
              <Button tone="amber" onClick={() => pauseBot(180)} disabled={loading}>Pausar 3h</Button>
              <Button tone="slate" onClick={resumeBot} disabled={loading}>Reanudar</Button>
            </div>
          </div>

          <div ref={listRef} className="flex-1 overflow-auto p-4 space-y-2">
            {msgs.map((m) => {
              const isCustomer = m.sender === 'CUSTOMER';
              const align = isCustomer ? 'justify-start' : 'justify-end';
              const tone = isCustomer
                ? 'bg-slate-950/40 ring-slate-800 text-slate-100'
                : m.sender === 'HUMAN'
                ? 'bg-sky-900/30 ring-sky-800 text-sky-100'
                : 'bg-emerald-900/25 ring-emerald-800 text-emerald-100';

              const body = m.type && m.type !== 'TEXT' ? `[${m.type}] ${m.text || ''}` : m.text || '';

              return (
                <div key={m.id} className={`flex ${align}`}>
                  <div className={`max-w-[82%] rounded-2xl px-3 py-2 text-sm ring-1 ${tone}`}>
                    <div className="flex items-center justify-between gap-3">
                      <div className="text-[10px] opacity-70">{m.sender}</div>
                      <div className="text-[10px] opacity-60">{fmtTime(m.timestamp)}</div>
                    </div>
                    <div className="whitespace-pre-wrap mt-1">{body}</div>
                    {m.mediaUrl && (
                      <div className="mt-2">
                        <a className="text-xs underline opacity-80 hover:opacity-100" href={m.mediaUrl} target="_blank" rel="noreferrer">
                          Abrir adjunto
                        </a>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {msgs.length === 0 && <div className="text-sm text-slate-400">Sin mensajes.</div>}
          </div>

          {!stickToBottom && (
            <div className="px-4 pb-2">
              <Button tone="slate" onClick={() => { listRef.current?.scrollTo({ top: listRef.current.scrollHeight }); setStickToBottom(true); }}>
                Ir al final
              </Button>
            </div>
          )}

          <div className="p-3 border-t border-slate-800 flex gap-2">
            <Input
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={convo?.state === 'HUMAN_TAKEOVER' ? 'Escribí como vendedor…' : 'Al enviar, activás handoff automáticamente…'}
              onKeyDown={(e) => {
                if (e.key === 'Enter') send();
              }}
            />
            <Button tone="green" onClick={send} disabled={sending || !text.trim()}>
              {sending ? 'Enviando…' : 'Enviar'}
            </Button>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-4">
          <div className="rounded-3xl bg-slate-900/40 ring-1 ring-slate-800 p-4">
            <div className="font-semibold">Asignación</div>
            <div className="text-xs text-slate-400 mt-1">Asignar a un vendedor activa handoff.</div>
            <select
              className="mt-3 w-full px-3 py-2 rounded-xl bg-slate-900/60 ring-1 ring-slate-800 text-slate-100"
              value={convo?.assignedUserId || ''}
              onChange={(e) => takeover(e.target.value || undefined)}
            >
              <option value="">— sin asignar —</option>
              {users
                .filter((u) => u.role === 'SELLER')
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
            </select>
          </div>

          <div className="rounded-3xl bg-slate-900/40 ring-1 ring-slate-800 p-4">
            <div className="font-semibold">Notas internas</div>
            <div className="mt-3 flex gap-2">
              <Input value={noteText} onChange={(e) => setNoteText(e.target.value)} placeholder="Nota interna…" />
              <Button tone="amber" onClick={addNote} disabled={!noteText.trim()}>
                Agregar
              </Button>
            </div>
            <div className="mt-4 space-y-2 max-h-[24vh] overflow-auto">
              {notes.map((n) => (
                <div key={n.id} className="rounded-2xl bg-slate-950/30 ring-1 ring-slate-800 p-3">
                  <div className="text-xs text-slate-400">
                    {n.user?.name || '—'} • {fmtDateTime(n.createdAt)}
                  </div>
                  <div className="text-sm text-slate-100 mt-1 whitespace-pre-wrap">{n.text}</div>
                </div>
              ))}
              {notes.length === 0 && <div className="text-sm text-slate-400">Sin notas.</div>}
            </div>
          </div>

          <div className="rounded-3xl bg-slate-900/40 ring-1 ring-slate-800 p-4">
            <div className="font-semibold">Eventos</div>
            <div className="text-xs text-slate-400 mt-1">Trazabilidad interna (bot/humano/status).</div>
            <div className="mt-3 space-y-2 max-h-[30vh] overflow-auto">
              {events.map((ev) => (
                <div key={ev.id} className="rounded-2xl bg-slate-950/30 ring-1 ring-slate-800 p-3">
                  <div className="text-xs text-slate-400">{fmtDateTime(ev.createdAt)}</div>
                  <div className="text-sm text-slate-100 mt-1">{ev.kind}</div>
                  {ev.payload && Object.keys(ev.payload).length > 0 && (
                    <div className="text-xs text-slate-400 mt-2 whitespace-pre-wrap">
                      {JSON.stringify(ev.payload, null, 2)}
                    </div>
                  )}
                </div>
              ))}
              {events.length === 0 && <div className="text-sm text-slate-400">Sin eventos.</div>}
            </div>
          </div>

          <div className="rounded-3xl bg-slate-900/40 ring-1 ring-slate-800 p-4">
            <div className="font-semibold">Sesión</div>
            <div className="text-sm text-slate-300 mt-2">{me?.name ? `Vendedor: ${me.name}` : '—'}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { socket } from '../lib/socket';
import Button from '../components/Button';
import Badge from '../components/Badge';
import Input from '../components/Input';

type Convo = {
  id: string;
  waFrom: string;
  state: 'BOT_ON'|'HUMAN_TAKEOVER';
  leadStatus: string;
  intentScore: number;
  assignedUserId?: string|null;
  assignedUser?: { id:string; name:string }|null;
};

type Msg = {
  id: string;
  direction: 'IN'|'OUT';
  sender: 'CUSTOMER'|'BOT'|'HUMAN'|'SYSTEM';
  text?: string|null;
  timestamp: string;
};

type User = { id:string; name:string; role:string; };

export default function ChatPage() {
  const { id } = useParams();
  const nav = useNavigate();
  const [convo, setConvo] = useState<Convo|null>(null);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState('');
  const [notes, setNotes] = useState<any[]>([]);
  const [noteText, setNoteText] = useState('');
  const [users, setUsers] = useState<User[]>([]);

  const me = useMemo(() => {
    try { return JSON.parse(localStorage.getItem('user')||'{}'); } catch { return {}; }
  }, []);

  async function load() {
    if (!id) return;
    const c = await api<Convo>(`/api/conversations/${id}`);
    const m = await api<Msg[]>(`/api/conversations/${id}/messages`);
    const n = await api<any[]>(`/api/conversations/${id}/notes`);
    const u = await api<User[]>(`/api/users`);
    setConvo(c); setMsgs(m); setNotes(n); setUsers(u);
  }

  useEffect(() => { load().catch(console.error); }, [id]);

  useEffect(() => {
    const onUpdate = (payload: any) => {
      if (payload?.conversationId === id) load().catch(console.error);
    };
    socket.on('conversation:updated', onUpdate);
    socket.on('message:new', onUpdate);
    return () => {
      socket.off('conversation:updated', onUpdate);
      socket.off('message:new', onUpdate);
    };
  }, [id]);

  async function send() {
    if (!id || !text.trim()) return;
    await api(`/api/conversations/${id}/send`, { method:'POST', body: JSON.stringify({ text: text.trim() }) });
    setText('');
    await load();
  }

  async function takeover() {
    if (!id) return;
    await api(`/api/conversations/${id}/takeover`, { method:'POST', body: JSON.stringify({}) });
    await load();
  }

  async function returnToBot() {
    if (!id) return;
    await api(`/api/conversations/${id}/return-to-bot`, { method:'POST', body: JSON.stringify({ silent: true }) });
    await load();
  }

  async function addNote() {
    if (!id || !noteText.trim()) return;
    await api(`/api/conversations/${id}/note`, { method:'POST', body: JSON.stringify({ text: noteText.trim() }) });
    setNoteText('');
    await load();
  }

  async function assignTo(userId: string) {
    if (!id) return;
    await api(`/api/conversations/${id}/takeover`, { method:'POST', body: JSON.stringify({ userId }) });
    await load();
  }

  return (
    <div className="min-h-screen p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button tone="slate" onClick={()=>nav('/')}>← Inbox</Button>
          <div>
            <div className="text-lg font-semibold">{convo?.waFrom || '...'}</div>
            <div className="text-xs text-slate-400">ID: {id}</div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {convo && <Badge tone={convo.state==='HUMAN_TAKEOVER'?'blue':'slate'}>{convo.state}</Badge>}
          {convo && <Badge tone={convo.leadStatus==='HOT'?'red':(convo.leadStatus==='WARM'?'amber':'slate') as any}>{convo.leadStatus}</Badge>}
          {convo && <div className="text-sm text-slate-300">Score: {convo.intentScore}</div>}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8 rounded-3xl bg-slate-900/40 ring-1 ring-slate-800 overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
            <div className="text-sm text-slate-300">
              Asignado: <span className="text-slate-100 font-medium">{convo?.assignedUser?.name || '—'}</span>
            </div>
            <div className="flex gap-2">
              <Button tone="blue" onClick={takeover}>Tomar</Button>
              <Button tone="slate" onClick={returnToBot}>Devolver al bot</Button>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-4 space-y-2">
            {msgs.map(m => (
              <div key={m.id} className={m.sender==='CUSTOMER' ? 'flex justify-start' : 'flex justify-end'}>
                <div className={
                  'max-w-[80%] rounded-2xl px-3 py-2 text-sm ring-1 ' +
                  (m.sender==='CUSTOMER'
                    ? 'bg-slate-950/40 ring-slate-800 text-slate-100'
                    : m.sender==='HUMAN'
                      ? 'bg-sky-900/30 ring-sky-800 text-sky-100'
                      : 'bg-emerald-900/25 ring-emerald-800 text-emerald-100')
                }>
                  <div className="text-[10px] opacity-70 mb-1">{m.sender}</div>
                  <div className="whitespace-pre-wrap">{m.text}</div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 border-t border-slate-800 flex gap-2">
            <Input value={text} onChange={e=>setText(e.target.value)} placeholder="Escribí como vendedor..." onKeyDown={e=>{ if (e.key==='Enter') send(); }} />
            <Button tone="green" onClick={send}>Enviar</Button>
          </div>
        </div>

        <div className="lg:col-span-4 space-y-4">
          <div className="rounded-3xl bg-slate-900/40 ring-1 ring-slate-800 p-4">
            <div className="font-semibold">Asignación</div>
            <div className="text-xs text-slate-400 mt-1">Podés asignar manualmente a un vendedor.</div>
            <select
              className="mt-3 w-full px-3 py-2 rounded-xl bg-slate-900/60 ring-1 ring-slate-800 text-slate-100"
              value={convo?.assignedUserId || ''}
              onChange={e=>assignTo(e.target.value)}
            >
              <option value="">— sin asignar —</option>
              {users.filter(u=>u.role==='SELLER').map(u => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
          </div>

          <div className="rounded-3xl bg-slate-900/40 ring-1 ring-slate-800 p-4">
            <div className="font-semibold">Notas internas</div>
            <div className="mt-3 flex gap-2">
              <Input value={noteText} onChange={e=>setNoteText(e.target.value)} placeholder="Nota interna..." />
              <Button tone="amber" onClick={addNote}>Agregar</Button>
            </div>
            <div className="mt-4 space-y-2 max-h-[30vh] overflow-auto">
              {notes.map(n => (
                <div key={n.id} className="rounded-2xl bg-slate-950/30 ring-1 ring-slate-800 p-3">
                  <div className="text-xs text-slate-400">{n.user?.name || '—'} • {new Date(n.createdAt).toLocaleString()}</div>
                  <div className="text-sm text-slate-100 mt-1 whitespace-pre-wrap">{n.text}</div>
                </div>
              ))}
              {notes.length===0 && <div className="text-sm text-slate-400">Sin notas.</div>}
            </div>
          </div>

          <div className="rounded-3xl bg-slate-900/40 ring-1 ring-slate-800 p-4">
            <div className="font-semibold">Reglas activas</div>
            <ul className="text-sm text-slate-300 mt-2 space-y-1 list-disc list-inside">
              <li>Si humano envía → bot se silencia automáticamente.</li>
              <li>Retorno a bot por inactividad o botón.</li>
              <li>Compra detectada → handoff automático (en horario).</li>
              <li>Si nadie toma → bot retoma + HOT_LOST.</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

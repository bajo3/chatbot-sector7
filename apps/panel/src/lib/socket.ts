import { io, Socket } from 'socket.io-client';
import { clearAuth, getToken } from './auth';
import { toast } from './toast';

const SOCKET_URL = import.meta.env.VITE_SOCKET_URL as string;

export const socket: Socket = io(SOCKET_URL, {
  autoConnect: false,
  transports: ['websocket', 'polling'],
  auth: {
    token: ''
  }
});

let wired = false;

export function connectSocket() {
  const token = getToken();
  socket.auth = { token };
  if (!wired) {
    wired = true;
    socket.on('connect_error', (err: any) => {
      const msg = err?.message || 'Socket error';
      if (String(msg).toLowerCase().includes('unauthorized') || String(msg).toLowerCase().includes('jwt')) {
        clearAuth();
        if (window.location.pathname !== '/login') window.location.assign('/login');
        return;
      }
      toast(`Socket: ${msg}`, 'amber');
    });
  }
  if (!socket.connected) socket.connect();
}

export function disconnectSocket() {
  if (socket.connected) socket.disconnect();
}

import { io, Socket } from 'socket.io-client';

// Empty string -> same origin as the page (works when the Express server
// serves the built frontend). Override with VITE_SERVER_URL when the
// frontend and backend are deployed as separate services.
const SERVER_URL = import.meta.env.VITE_SERVER_URL || '';

export const socket: Socket = io(SERVER_URL, {
  autoConnect: true,
  transports: ['websocket', 'polling'],
});

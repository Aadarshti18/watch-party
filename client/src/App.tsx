import { useState } from 'react';
import Home from './pages/Home';
import Room from './pages/Room';
import type { Participant, RoomSnapshot } from './types';

function getInitialRoomCodeFromUrl(): string | undefined {
  const match = window.location.pathname.match(/^\/r\/([A-Za-z0-9]+)$/);
  return match ? match[1].toUpperCase() : undefined;
}

export default function App() {
  const [session, setSession] = useState<{ room: RoomSnapshot; you: Participant } | null>(null);
  const [initialRoomCode] = useState(getInitialRoomCodeFromUrl);

  function handleEntered(room: RoomSnapshot, you: Participant) {
    window.history.replaceState(null, '', `/r/${room.roomId}`);
    setSession({ room, you });
  }

  function handleLeave() {
    window.history.replaceState(null, '', '/');
    setSession(null);
  }

  return (
    <div className="app-shell">
      {session ? (
        <Room initialSnapshot={session.room} initialYou={session.you} onLeave={handleLeave} />
      ) : (
        <Home initialRoomCode={initialRoomCode} onEntered={handleEntered} />
      )}
    </div>
  );
}

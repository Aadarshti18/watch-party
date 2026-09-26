import { useState } from 'react';
import { socket } from '../socket';
import type { CreateRoomAck, FailedAck, JoinRoomAck, Participant, RoomSnapshot } from '../types';

interface HomeProps {
  initialRoomCode?: string;
  onEntered: (room: RoomSnapshot, you: Participant) => void;
}

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_USERNAME: 'Enter a name (up to 24 characters).',
  INVALID_ROOM_ID: 'Enter the room code you were given.',
  ROOM_NOT_FOUND: "That room code doesn't match an open room.",
};

export default function Home({ initialRoomCode, onEntered }: HomeProps) {
  const [tab, setTab] = useState<'create' | 'join'>(initialRoomCode ? 'join' : 'create');
  const [username, setUsername] = useState('');
  const [roomCode, setRoomCode] = useState(initialRoomCode ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    socket.emit('create_room', { username }, (ack: CreateRoomAck | FailedAck) => {
      setBusy(false);
      if (!ack.success) return setError(ERROR_MESSAGES[ack.error] ?? 'Could not create the room.');
      onEntered(ack, ack.you);
    });
  }

  function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    socket.emit('join_room', { username, roomId: roomCode.trim().toUpperCase() }, (ack: JoinRoomAck | FailedAck) => {
      setBusy(false);
      if (!ack.success) return setError(ERROR_MESSAGES[ack.error] ?? 'Could not join the room.');
      onEntered(ack, ack.you);
    });
  }

  return (
    <div className="home">
      <div className="home-inner">
        <h1 className="marquee-title">Watch Party</h1>
        <div className="marquee-lights" aria-hidden="true">
          {Array.from({ length: 7 }).map((_, i) => (
            <span key={i} />
          ))}
        </div>
        <p className="home-subtitle">
          Watch YouTube videos in sync, <span className="home-subtitle-accent">together</span>.
        </p>

        <div className="panel">
          <div className="tab-row" role="tablist">
            <div
              className="tab-row-indicator"
              style={{ transform: tab === 'join' ? 'translateX(100%)' : 'translateX(0)' }}
              aria-hidden="true"
            />
            <button
              type="button"
              role="tab"
              className={tab === 'create' ? 'active' : ''}
              onClick={() => {
                setTab('create');
                setError(null);
              }}
            >
              Create a room
            </button>
            <button
              type="button"
              role="tab"
              className={tab === 'join' ? 'active' : ''}
              onClick={() => {
                setTab('join');
                setError(null);
              }}
            >
              Join a room
            </button>
          </div>

          {tab === 'create' ? (
            <form key="create" className="form-fade" onSubmit={handleCreate}>
              <div className="field">
                <label htmlFor="create-name">Your name</label>
                <input
                  id="create-name"
                  value={username}
                  maxLength={24}
                  placeholder="e.g. Priya"
                  onChange={(e) => setUsername(e.target.value)}
                  autoFocus
                />
              </div>
              {error && <p className="form-error">{error}</p>}
              <button className="btn btn-primary" disabled={busy || !username.trim()}>
                {busy ? 'Creating…' : 'Create room'}
              </button>
            </form>
          ) : (
            <form key="join" className="form-fade" onSubmit={handleJoin}>
              <div className="field">
                <label htmlFor="join-code">Room code</label>
                <input
                  id="join-code"
                  value={roomCode}
                  maxLength={8}
                  placeholder="e.g. 7K3PQR"
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  autoFocus={!initialRoomCode}
                />
              </div>
              <div className="field">
                <label htmlFor="join-name">Your name</label>
                <input
                  id="join-name"
                  value={username}
                  maxLength={24}
                  placeholder="e.g. Priya"
                  onChange={(e) => setUsername(e.target.value)}
                />
              </div>
              {error && <p className="form-error">{error}</p>}
              <button className="btn btn-primary" disabled={busy || !username.trim() || !roomCode.trim()}>
                {busy ? 'Joining…' : 'Join room'}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
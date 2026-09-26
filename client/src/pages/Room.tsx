import { useCallback, useEffect, useRef, useState } from 'react';
import { socket } from '../socket';
import YouTubePlayer, { type YouTubePlayerHandle } from '../components/YouTubePlayer';
import Controls from '../components/Controls';
import ParticipantList from '../components/ParticipantList';
import PendingRequests from '../components/PendingRequests';
import Chat from '../components/Chat';
import type {
  ChatMessage,
  ControlAction,
  Participant,
  PendingRequest,
  PlaybackState,
  Role,
  RoomSnapshot,
  ServerErrorPayload,
} from '../types';

interface RoomProps {
  initialSnapshot: RoomSnapshot;
  initialYou: Participant;
  onLeave: () => void;
}

interface Toast {
  id: string;
  message: string;
  danger?: boolean;
}

type SidebarTab = 'participants' | 'requests' | 'chat';

export default function Room({ initialSnapshot, initialYou, onLeave }: RoomProps) {
  const myUserId = initialYou.userId;
  const playerRef = useRef<YouTubePlayerHandle>(null);

  const [participants, setParticipants] = useState<Participant[]>(initialSnapshot.participants);
  const [playback, setPlayback] = useState<PlaybackState>(initialSnapshot.playback);
  const [pendingRequests, setPendingRequests] = useState<PendingRequest[]>([]);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [tab, setTab] = useState<SidebarTab>('participants');

  const you = participants.find((p) => p.userId === myUserId) ?? initialYou;
  const canControl = you.role === 'host' || you.role === 'moderator';

  const pushToast = useCallback((message: string, danger = false) => {
    const id = `${Date.now()}-${Math.random()}`;
    setToasts((prev) => [...prev, { id, message, danger }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4500);
  }, []);

  // Apply the latest server playback state to the actual YouTube player
  // every time it changes - this is the single reconciliation path used
  // for both remote actions and the actor's own action.
  useEffect(() => {
    playerRef.current?.applyRemoteState(playback);
  }, [playback]);

  useEffect(() => {
    function onSyncState(state: PlaybackState) {
      setPlayback(state);
    }
    function onUserJoined(data: { participants: Participant[]; username: string }) {
      setParticipants(data.participants);
      pushToast(`${data.username} joined.`);
    }
    function onUserLeft(data: { participants: Participant[]; username: string }) {
      setParticipants(data.participants);
      pushToast(`${data.username} left.`);
    }
    function onRoleAssigned(data: { participants: Participant[]; username: string; role: Role }) {
      setParticipants(data.participants);
      pushToast(`${data.username} is now ${data.role}.`);
    }
    function onHostTransferred(data: { participants: Participant[]; newHostUsername: string }) {
      setParticipants(data.participants);
      pushToast(`${data.newHostUsername} is now the host.`);
    }
    function onParticipantRemoved(data: { participants: Participant[]; userId: string; youWereRemoved?: boolean }) {
      if (data.youWereRemoved) {
        pushToast('You were removed from the room.', true);
        onLeave();
        return;
      }
      setParticipants(data.participants);
    }
    function onControlRequested(request: PendingRequest) {
      setPendingRequests((prev) => [...prev.filter((r) => r.requestId !== request.requestId), request]);
      pushToast(`${request.username} requested control.`);
    }
    function onPendingRequestsUpdated(requests: PendingRequest[]) {
      setPendingRequests(requests);
    }
    function onRequestApproved() {
      pushToast('Your request was approved.');
    }
    function onRequestDenied() {
      pushToast('Your request was denied.', true);
    }
    function onChatMessage(message: ChatMessage) {
      setChatMessages((prev) => [...prev, message]);
    }
    function onError(payload: ServerErrorPayload) {
      pushToast(payload.message, true);
    }

    socket.on('sync_state', onSyncState);
    socket.on('user_joined', onUserJoined);
    socket.on('user_left', onUserLeft);
    socket.on('role_assigned', onRoleAssigned);
    socket.on('host_transferred', onHostTransferred);
    socket.on('participant_removed', onParticipantRemoved);
    socket.on('control_requested', onControlRequested);
    socket.on('pending_requests_updated', onPendingRequestsUpdated);
    socket.on('request_approved', onRequestApproved);
    socket.on('request_denied', onRequestDenied);
    socket.on('chat_message', onChatMessage);
    socket.on('error', onError);

    return () => {
      socket.off('sync_state', onSyncState);
      socket.off('user_joined', onUserJoined);
      socket.off('user_left', onUserLeft);
      socket.off('role_assigned', onRoleAssigned);
      socket.off('host_transferred', onHostTransferred);
      socket.off('participant_removed', onParticipantRemoved);
      socket.off('control_requested', onControlRequested);
      socket.off('pending_requests_updated', onPendingRequestsUpdated);
      socket.off('request_approved', onRequestApproved);
      socket.off('request_denied', onRequestDenied);
      socket.off('chat_message', onChatMessage);
      socket.off('error', onError);
    };
  }, [onLeave, pushToast]);

  function requestOrAct(action: ControlAction, payload: Record<string, unknown>, directEvent: string) {
    if (canControl) {
      socket.emit(directEvent, payload);
    } else {
      socket.emit('request_control', { action, payload });
    }
  }

  function handleTogglePlayPause(currentTime: number) {
    const wantsToPlay = playback.playState !== 'playing';
    requestOrAct(wantsToPlay ? 'play' : 'pause', { currentTime }, wantsToPlay ? 'play' : 'pause');
  }

  function handleSeekCommit(time: number) {
    requestOrAct('seek', { time }, 'seek');
  }

  function handleChangeVideo(videoId: string) {
    requestOrAct('change_video', { videoId }, 'change_video');
  }

  function handleLeave() {
    socket.emit('leave_room');
    onLeave();
  }

  return (
    <div className="room">
      <header className="room-header">
        <span className="brand">Watch Party</span>
        <div className="room-code">
          <span>
            Room code: <strong>{initialSnapshot.roomId}</strong>
          </span>
          <button
            type="button"
            className="btn btn-secondary btn-small"
            onClick={() => {
              navigator.clipboard?.writeText(initialSnapshot.roomId);
              pushToast('Room code copied.');
            }}
          >
            Copy
          </button>
          <button type="button" className="btn btn-danger btn-small" onClick={handleLeave}>
            Leave
          </button>
        </div>
      </header>

      <div className="room-body">
        <div className="stage">
          <div className="video-wrap">
            <YouTubePlayer ref={playerRef} />
            {!playback.videoId && (
              <div className="video-empty">
                {canControl ? 'Paste a YouTube link below to start watching.' : 'Waiting for the host to pick a video.'}
              </div>
            )}
          </div>

          <Controls
            playback={playback}
            canControl={canControl}
            getCurrentTime={() => playerRef.current?.getCurrentTime() ?? 0}
            getDuration={() => playerRef.current?.getDuration() ?? 0}
            onTogglePlayPause={handleTogglePlayPause}
            onSeekCommit={handleSeekCommit}
            onChangeVideo={handleChangeVideo}
          />
        </div>

        <aside className="sidebar">
          <div className="sidebar-tabs">
            <button type="button" className={tab === 'participants' ? 'active' : ''} onClick={() => setTab('participants')}>
              People
              <span className="badge-count">{participants.length}</span>
            </button>
            {canControl && (
              <button type="button" className={tab === 'requests' ? 'active' : ''} onClick={() => setTab('requests')}>
                Requests
                {pendingRequests.length > 0 && <span className="badge-count">{pendingRequests.length}</span>}
              </button>
            )}
            <button type="button" className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}>
              Chat
            </button>
          </div>

          {tab === 'participants' && (
            <ParticipantList
              participants={participants}
              you={you}
              onAssignRole={(userId, role) => socket.emit('assign_role', { userId, role })}
              onRemove={(userId) => socket.emit('remove_participant', { userId })}
              onTransferHost={(userId) => {
                if (confirm('Transfer host to this participant?')) socket.emit('transfer_host', { userId });
              }}
            />
          )}

          {tab === 'requests' && canControl && (
            <PendingRequests
              requests={pendingRequests}
              onApprove={(id) => socket.emit('approve_request', { requestId: id })}
              onDeny={(id) => socket.emit('deny_request', { requestId: id })}
            />
          )}

          {tab === 'chat' && <Chat messages={chatMessages} onSend={(text) => socket.emit('chat_message', { text })} />}
        </aside>
      </div>

      <div className="toast-stack">
        {toasts.map((t) => (
          <div key={t.id} className={`toast ${t.danger ? 'danger' : ''}`}>
            {t.message}
          </div>
        ))}
      </div>
    </div>
  );
}

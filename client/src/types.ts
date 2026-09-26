export type Role = 'host' | 'moderator' | 'participant';

export interface Participant {
  userId: string;
  username: string;
  role: Role;
  joinedAt: number;
}

export type PlayState = 'playing' | 'paused';

export interface PlaybackState {
  videoId: string | null;
  playState: PlayState;
  currentTime: number;
  updatedAt: number;
}

export interface RoomSnapshot {
  roomId: string;
  hostId: string;
  playback: PlaybackState;
  participants: Participant[];
}

export type ControlAction = 'play' | 'pause' | 'seek' | 'change_video';

export interface PendingRequest {
  requestId: string;
  participantId: string;
  username: string;
  action: ControlAction;
  payload: Record<string, unknown> | null;
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  userId: string;
  username: string;
  text: string;
  sentAt: number;
}

export interface ServerErrorPayload {
  event: string;
  code: string;
  message: string;
}

export interface CreateRoomAck extends RoomSnapshot {
  success: true;
  you: Participant;
}

export interface JoinRoomAck extends RoomSnapshot {
  success: true;
  you: Participant;
}

export interface FailedAck {
  success: false;
  error: string;
}

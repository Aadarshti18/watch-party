const { ROLES } = require('../utils/roles');
const { generateId } = require('../utils/idGenerator');

const MAX_CHAT_HISTORY = 100;

// New rooms start on this video (paused, ready to play) instead of a blank
// player. The host can still change it any time via change_video.
const DEFAULT_VIDEO_ID = 'B-2BCSxnyHA';

/**
 * A single watch party room. Owns:
 *  - the participant list (Map<socketId, Participant>)
 *  - the shared playback state (video, play/pause, current time)
 *  - a queue of pending control requests from participants
 *  - a short in-memory chat history
 *
 * A Room never talks to sockets directly - the socket handler layer reads
 * this state and decides what to broadcast. That keeps this class easily
 * unit-testable and independent of Socket.IO.
 */
class Room {
  constructor({ id, hostId }) {
    this.id = id;
    this.createdAt = Date.now();

    /** @type {Map<string, import('./Participant')>} */
    this.participants = new Map();

    this.hostId = hostId;

    this.playback = {
      videoId: DEFAULT_VIDEO_ID,
      playState: 'paused', // 'playing' | 'paused'
      currentTime: 0,
      updatedAt: Date.now(),
    };

    // requestId -> { requestId, participantId, username, action, payload, createdAt }
    this.pendingRequests = new Map();

    this.chatHistory = [];
  }

  // ---- Participants -----------------------------------------------------

  addParticipant(participant) {
    this.participants.set(participant.id, participant);
  }

  removeParticipant(socketId) {
    this.participants.delete(socketId);
    // Drop any pending requests raised by a participant who left.
    for (const [requestId, req] of this.pendingRequests) {
      if (req.participantId === socketId) this.pendingRequests.delete(requestId);
    }
  }

  getParticipant(socketId) {
    return this.participants.get(socketId);
  }

  get size() {
    return this.participants.size;
  }

  isEmpty() {
    return this.participants.size === 0;
  }

  listParticipants() {
    return Array.from(this.participants.values()).map((p) => p.toJSON());
  }

  listStaff() {
    // Host + moderators - the people allowed to review control requests.
    return Array.from(this.participants.values()).filter(
      (p) => p.role === ROLES.HOST || p.role === ROLES.MODERATOR
    );
  }

  // ---- Host / roles -------------------------------------------------------

  transferHost(newHostSocketId) {
    const current = this.getParticipant(this.hostId);
    const next = this.getParticipant(newHostSocketId);
    if (!next) return false;
    if (current) current.setRole(ROLES.MODERATOR);
    next.setRole(ROLES.HOST);
    this.hostId = newHostSocketId;
    return true;
  }

  // Picks the longest-standing remaining participant to become host,
  // used when the host disconnects without transferring first.
  promoteNextHost() {
    let candidate = null;
    for (const p of this.participants.values()) {
      if (!candidate || p.joinedAt < candidate.joinedAt) candidate = p;
    }
    if (candidate) {
      candidate.setRole(ROLES.HOST);
      this.hostId = candidate.id;
    } else {
      this.hostId = null;
    }
    return candidate;
  }

  // ---- Playback state -----------------------------------------------------

  applyPlay(currentTime) {
    this.playback.playState = 'playing';
    if (typeof currentTime === 'number' && Number.isFinite(currentTime)) {
      this.playback.currentTime = currentTime;
    }
    this.playback.updatedAt = Date.now();
  }

  applyPause(currentTime) {
    this.playback.playState = 'paused';
    if (typeof currentTime === 'number' && Number.isFinite(currentTime)) {
      this.playback.currentTime = currentTime;
    }
    this.playback.updatedAt = Date.now();
  }

  applySeek(time) {
    this.playback.currentTime = time;
    this.playback.updatedAt = Date.now();
  }

  applyChangeVideo(videoId) {
    this.playback.videoId = videoId;
    this.playback.currentTime = 0;
    this.playback.playState = 'paused';
    this.playback.updatedAt = Date.now();
  }

  getPlaybackState() {
    return { ...this.playback };
  }

  // ---- Control requests (participant -> host/mod approval flow) ----------

  createPendingRequest({ participantId, username, action, payload }) {
    const requestId = generateId();
    const request = {
      requestId,
      participantId,
      username,
      action,
      payload: payload ?? null,
      createdAt: Date.now(),
    };
    this.pendingRequests.set(requestId, request);
    return request;
  }

  consumePendingRequest(requestId) {
    const request = this.pendingRequests.get(requestId);
    if (request) this.pendingRequests.delete(requestId);
    return request ?? null;
  }

  listPendingRequests() {
    return Array.from(this.pendingRequests.values());
  }

  // ---- Chat (bonus) --------------------------------------------------------

  addChatMessage({ userId, username, text }) {
    const message = { id: generateId(), userId, username, text, sentAt: Date.now() };
    this.chatHistory.push(message);
    if (this.chatHistory.length > MAX_CHAT_HISTORY) this.chatHistory.shift();
    return message;
  }
}

module.exports = Room;
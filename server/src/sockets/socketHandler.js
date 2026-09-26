const {
  ROLES,
  canControlPlayback,
  canManageRoles,
  canRemoveParticipants,
  canTransferHost,
  canReviewRequests,
  isValidAssignableRole,
} = require('../utils/roles');

const CONTROL_ACTIONS = new Set(['play', 'pause', 'seek', 'change_video']);
const MAX_USERNAME_LENGTH = 24;
const MAX_CHAT_LENGTH = 500;

function cleanUsername(raw) {
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim().slice(0, MAX_USERNAME_LENGTH);
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * MessageHandler-style class: one instance wires every Socket.IO event to
 * the RoomManager and is the single place permission checks happen. Kept
 * framework-light on purpose - Room/RoomManager know nothing about sockets,
 * this class knows nothing about HTTP, so each piece is easy to reason
 * about and to unit test on its own.
 */
class SocketHandler {
  constructor(io, roomManager) {
    this.io = io;
    this.roomManager = roomManager;
  }

  init() {
    this.io.on('connection', (socket) => this.handleConnection(socket));
  }

  handleConnection(socket) {
    socket.on('create_room', (payload, ack) => this.onCreateRoom(socket, payload, ack));
    socket.on('join_room', (payload, ack) => this.onJoinRoom(socket, payload, ack));
    socket.on('leave_room', () => this.onLeaveRoom(socket));

    socket.on('play', (payload) => this.onControlAction(socket, 'play', payload));
    socket.on('pause', (payload) => this.onControlAction(socket, 'pause', payload));
    socket.on('seek', (payload) => this.onControlAction(socket, 'seek', payload));
    socket.on('change_video', (payload) => this.onControlAction(socket, 'change_video', payload));

    socket.on('assign_role', (payload) => this.onAssignRole(socket, payload));
    socket.on('remove_participant', (payload) => this.onRemoveParticipant(socket, payload));
    socket.on('transfer_host', (payload) => this.onTransferHost(socket, payload));

    socket.on('request_control', (payload) => this.onRequestControl(socket, payload));
    socket.on('approve_request', (payload) => this.onReviewRequest(socket, payload, true));
    socket.on('deny_request', (payload) => this.onReviewRequest(socket, payload, false));

    socket.on('chat_message', (payload) => this.onChatMessage(socket, payload));

    socket.on('disconnect', () => this.onDisconnect(socket));
  }

  // ---- helpers --------------------------------------------------------

  sendError(socket, event, message, code = 'ERROR') {
    socket.emit('error', { event, code, message });
  }

  serializeRoom(room) {
    return {
      roomId: room.id,
      hostId: room.hostId,
      playback: room.getPlaybackState(),
      participants: room.listParticipants(),
    };
  }

  applyControlAction(room, action, payload) {
    switch (action) {
      case 'play':
        room.applyPlay(payload && payload.currentTime);
        break;
      case 'pause':
        room.applyPause(payload && payload.currentTime);
        break;
      case 'seek':
        room.applySeek(payload && payload.time);
        break;
      case 'change_video':
        room.applyChangeVideo(payload && payload.videoId);
        break;
      default:
        break;
    }
  }

  broadcastToStaff(room, event, data) {
    for (const staffMember of room.listStaff()) {
      this.io.to(staffMember.id).emit(event, data);
    }
  }

  // ---- room lifecycle ---------------------------------------------------

  onCreateRoom(socket, payload, ack) {
    const username = cleanUsername(payload && payload.username);
    if (!username) {
      return ack?.({ success: false, error: 'INVALID_USERNAME' });
    }

    const room = this.roomManager.createRoom(socket.id, username);
    socket.join(room.id);

    ack?.({ success: true, ...this.serializeRoom(room), you: room.getParticipant(socket.id).toJSON() });
  }

  onJoinRoom(socket, payload, ack) {
    const username = cleanUsername(payload && payload.username);
    const roomId = payload && payload.roomId;

    if (!username) return ack?.({ success: false, error: 'INVALID_USERNAME' });
    if (!roomId || typeof roomId !== 'string') {
      return ack?.({ success: false, error: 'INVALID_ROOM_ID' });
    }

    const result = this.roomManager.joinRoom(roomId, socket.id, username);
    if (result.error) return ack?.({ success: false, error: result.error });

    const { room, participant } = result;
    socket.join(room.id);

    ack?.({ success: true, ...this.serializeRoom(room), you: participant.toJSON() });

    socket.to(room.id).emit('user_joined', {
      userId: participant.id,
      username: participant.username,
      role: participant.role,
      participants: room.listParticipants(),
    });
  }

  onLeaveRoom(socket) {
    const room = this.roomManager.getRoomBySocketId(socket.id);
    if (!room) return;
    const leaving = room.getParticipant(socket.id);

    const result = this.roomManager.leaveBySocketId(socket.id);
    socket.leave(room.id);
    if (!result) return;

    this.notifyRoomAfterLeave(result, leaving);
  }

  onDisconnect(socket) {
    const room = this.roomManager.getRoomBySocketId(socket.id);
    if (!room) return;
    const leaving = room.getParticipant(socket.id);

    const result = this.roomManager.leaveBySocketId(socket.id);
    if (!result) return;

    this.notifyRoomAfterLeave(result, leaving);
  }

  notifyRoomAfterLeave({ room, wasHost, newHost }, leaving) {
    if (!leaving || room.isEmpty()) return; // room was deleted, nobody left to notify

    this.io.to(room.id).emit('user_left', {
      userId: leaving.id,
      username: leaving.username,
      participants: room.listParticipants(),
    });

    if (wasHost && newHost) {
      this.io.to(room.id).emit('host_transferred', {
        newHostId: newHost.id,
        newHostUsername: newHost.username,
        reason: 'host_disconnected',
        participants: room.listParticipants(),
      });
    }
  }

  // ---- playback control ---------------------------------------------------

  onControlAction(socket, action, payload) {
    const room = this.roomManager.getRoomBySocketId(socket.id);
    if (!room) return this.sendError(socket, action, 'You are not in a room.', 'NOT_IN_ROOM');

    const participant = room.getParticipant(socket.id);
    if (!participant) return;

    if (action === 'change_video') {
      const videoId = payload && payload.videoId;
      if (!videoId || typeof videoId !== 'string') {
        return this.sendError(socket, action, 'A valid videoId is required.', 'INVALID_PAYLOAD');
      }
    }

    if (!canControlPlayback(participant.role)) {
      return this.sendError(
        socket,
        action,
        'Only the host or a moderator can control playback. Request control instead.',
        'FORBIDDEN'
      );
    }

    this.applyControlAction(room, action, payload);
    this.io.to(room.id).emit('sync_state', room.getPlaybackState());
  }

  // ---- role management (host only) -----------------------------------------

  onAssignRole(socket, payload) {
    const room = this.roomManager.getRoomBySocketId(socket.id);
    if (!room) return this.sendError(socket, 'assign_role', 'You are not in a room.', 'NOT_IN_ROOM');

    const actor = room.getParticipant(socket.id);
    if (!actor || !canManageRoles(actor.role)) {
      return this.sendError(socket, 'assign_role', 'Only the host can assign roles.', 'FORBIDDEN');
    }

    const { userId, role } = payload || {};
    if (!isValidAssignableRole(role)) {
      return this.sendError(socket, 'assign_role', 'Role must be "moderator" or "participant".', 'INVALID_PAYLOAD');
    }

    const target = room.getParticipant(userId);
    if (!target) return this.sendError(socket, 'assign_role', 'Participant not found.', 'NOT_FOUND');
    if (target.id === room.hostId) {
      return this.sendError(socket, 'assign_role', 'Use transfer_host to change the host.', 'INVALID_TARGET');
    }

    target.setRole(role);

    this.io.to(room.id).emit('role_assigned', {
      userId: target.id,
      username: target.username,
      role: target.role,
      participants: room.listParticipants(),
    });
  }

  onRemoveParticipant(socket, payload) {
    const room = this.roomManager.getRoomBySocketId(socket.id);
    if (!room) return this.sendError(socket, 'remove_participant', 'You are not in a room.', 'NOT_IN_ROOM');

    const actor = room.getParticipant(socket.id);
    if (!actor || !canRemoveParticipants(actor.role)) {
      return this.sendError(socket, 'remove_participant', 'Only the host can remove participants.', 'FORBIDDEN');
    }

    const { userId } = payload || {};
    if (!userId || userId === socket.id) {
      return this.sendError(socket, 'remove_participant', 'Invalid participant.', 'INVALID_PAYLOAD');
    }

    const target = room.getParticipant(userId);
    if (!target) return this.sendError(socket, 'remove_participant', 'Participant not found.', 'NOT_FOUND');

    this.roomManager.removeParticipant(room.id, userId);

    const targetSocket = this.io.sockets.sockets.get(userId);
    if (targetSocket) {
      targetSocket.emit('participant_removed', { userId, participants: room.listParticipants(), youWereRemoved: true });
      targetSocket.leave(room.id);
    }

    this.io.to(room.id).emit('participant_removed', { userId, participants: room.listParticipants() });
  }

  onTransferHost(socket, payload) {
    const room = this.roomManager.getRoomBySocketId(socket.id);
    if (!room) return this.sendError(socket, 'transfer_host', 'You are not in a room.', 'NOT_IN_ROOM');

    const actor = room.getParticipant(socket.id);
    if (!actor || !canTransferHost(actor.role)) {
      return this.sendError(socket, 'transfer_host', 'Only the host can transfer host.', 'FORBIDDEN');
    }

    const { userId } = payload || {};
    const target = room.getParticipant(userId);
    if (!target || target.id === socket.id) {
      return this.sendError(socket, 'transfer_host', 'Invalid target participant.', 'INVALID_PAYLOAD');
    }

    room.transferHost(userId);

    this.io.to(room.id).emit('host_transferred', {
      newHostId: target.id,
      newHostUsername: target.username,
      reason: 'manual_transfer',
      participants: room.listParticipants(),
    });
  }

  // ---- control requests (participant asks host/mod for temporary control) --

  onRequestControl(socket, payload) {
    const room = this.roomManager.getRoomBySocketId(socket.id);
    if (!room) return this.sendError(socket, 'request_control', 'You are not in a room.', 'NOT_IN_ROOM');

    const participant = room.getParticipant(socket.id);
    if (!participant) return;

    if (canControlPlayback(participant.role)) {
      return this.sendError(socket, 'request_control', 'You already have playback control.', 'NOT_NEEDED');
    }

    const { action, payload: actionPayload } = payload || {};
    if (!CONTROL_ACTIONS.has(action)) {
      return this.sendError(socket, 'request_control', 'Unknown action requested.', 'INVALID_PAYLOAD');
    }

    const request = room.createPendingRequest({
      participantId: participant.id,
      username: participant.username,
      action,
      payload: actionPayload,
    });

    this.broadcastToStaff(room, 'control_requested', request);
    socket.emit('request_sent', { requestId: request.requestId });
  }

  onReviewRequest(socket, payload, approve) {
    const room = this.roomManager.getRoomBySocketId(socket.id);
    if (!room) return this.sendError(socket, 'approve_request', 'You are not in a room.', 'NOT_IN_ROOM');

    const actor = room.getParticipant(socket.id);
    if (!actor || !canReviewRequests(actor.role)) {
      return this.sendError(socket, 'approve_request', 'Only the host or a moderator can review requests.', 'FORBIDDEN');
    }

    const { requestId } = payload || {};
    const request = room.consumePendingRequest(requestId);
    if (!request) return this.sendError(socket, 'approve_request', 'That request no longer exists.', 'NOT_FOUND');

    const requesterSocket = this.io.sockets.sockets.get(request.participantId);

    if (approve) {
      this.applyControlAction(room, request.action, request.payload);
      this.io.to(room.id).emit('sync_state', room.getPlaybackState());
      requesterSocket?.emit('request_approved', { requestId: request.requestId, action: request.action });
    } else {
      requesterSocket?.emit('request_denied', { requestId: request.requestId, action: request.action });
    }

    this.broadcastToStaff(room, 'pending_requests_updated', room.listPendingRequests());
  }

  // ---- chat (bonus) ---------------------------------------------------------

  onChatMessage(socket, payload) {
    const room = this.roomManager.getRoomBySocketId(socket.id);
    if (!room) return;

    const participant = room.getParticipant(socket.id);
    if (!participant) return;

    const text = typeof (payload && payload.text) === 'string' ? payload.text.trim().slice(0, MAX_CHAT_LENGTH) : '';
    if (!text) return;

    const message = room.addChatMessage({ userId: participant.id, username: participant.username, text });
    this.io.to(room.id).emit('chat_message', message);
  }
}

module.exports = SocketHandler;

const Room = require('../models/Room');
const Participant = require('../models/Participant');
const { ROLES } = require('../utils/roles');
const { generateRoomCode } = require('../utils/idGenerator');

/**
 * Owns every live Room and the socketId -> roomId index used to find a
 * participant's room quickly on disconnect. This is the single source of
 * truth the socket layer talks to; it never touches Socket.IO itself.
 */
class RoomManager {
  constructor() {
    /** @type {Map<string, Room>} */
    this.rooms = new Map();
    /** @type {Map<string, string>} socketId -> roomId */
    this.socketToRoom = new Map();
  }

  createRoom(hostSocketId, hostUsername) {
    let id = generateRoomCode();
    // Extremely unlikely collision, but guard anyway.
    while (this.rooms.has(id)) id = generateRoomCode();

    const room = new Room({ id, hostId: hostSocketId });
    const host = new Participant({ id: hostSocketId, username: hostUsername, role: ROLES.HOST });
    room.addParticipant(host);

    this.rooms.set(id, room);
    this.socketToRoom.set(hostSocketId, id);
    return room;
  }

  joinRoom(roomId, socketId, username) {
    const room = this.rooms.get(roomId.toUpperCase());
    if (!room) return { error: 'ROOM_NOT_FOUND' };

    const participant = new Participant({ id: socketId, username, role: ROLES.PARTICIPANT });
    room.addParticipant(participant);
    this.socketToRoom.set(socketId, room.id);
    return { room, participant };
  }

  getRoom(roomId) {
    if (!roomId) return null;
    return this.rooms.get(roomId.toUpperCase()) ?? null;
  }

  getRoomBySocketId(socketId) {
    const roomId = this.socketToRoom.get(socketId);
    return roomId ? this.rooms.get(roomId) ?? null : null;
  }

  /**
   * Removes a participant from whatever room they're in. If they were the
   * host, promotes the longest-standing remaining participant. If the room
   * is now empty, deletes it.
   * Returns { room, wasHost, newHost } or null if the socket wasn't tracked.
   */
  leaveBySocketId(socketId) {
    const room = this.getRoomBySocketId(socketId);
    if (!room) return null;

    const wasHost = room.hostId === socketId;
    room.removeParticipant(socketId);
    this.socketToRoom.delete(socketId);

    let newHost = null;
    if (wasHost && !room.isEmpty()) {
      newHost = room.promoteNextHost();
    }

    if (room.isEmpty()) {
      this.rooms.delete(room.id);
    }

    return { room, wasHost, newHost };
  }

  removeParticipant(roomId, socketId) {
    const room = this.getRoom(roomId);
    if (!room) return null;
    room.removeParticipant(socketId);
    this.socketToRoom.delete(socketId);
    if (room.isEmpty()) this.rooms.delete(room.id);
    return room;
  }

  stats() {
    let participantCount = 0;
    for (const room of this.rooms.values()) participantCount += room.size;
    return { roomCount: this.rooms.size, participantCount };
  }
}

module.exports = RoomManager;

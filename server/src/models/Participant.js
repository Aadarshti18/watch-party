const { ROLES } = require('../utils/roles');

/**
 * Represents one connected user inside a Room.
 * `id` is that user's socket.id for the current connection.
 */
class Participant {
  constructor({ id, username, role = ROLES.PARTICIPANT }) {
    this.id = id;
    this.username = username;
    this.role = role;
    this.joinedAt = Date.now();
  }

  setRole(role) {
    this.role = role;
  }

  toJSON() {
    return {
      userId: this.id,
      username: this.username,
      role: this.role,
      joinedAt: this.joinedAt,
    };
  }
}

module.exports = Participant;

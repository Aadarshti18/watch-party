/**
 * Role model for the watch party.
 *
 * HOST        - room creator. Full control, always exactly one per room.
 * MODERATOR   - assigned by the host. Can control playback and approve
 *               control requests from participants.
 * PARTICIPANT - default role for anyone who joins. Watch-only; must ask
 *               the host/moderator for temporary control.
 *
 * The assignment spec also lists "Viewer" as an alias of "Participant".
 * We implement that as a single role (PARTICIPANT) to keep permission
 * checks unambiguous, and expose VIEWER as an alias below.
 */
const ROLES = Object.freeze({
  HOST: 'host',
  MODERATOR: 'moderator',
  PARTICIPANT: 'participant',
});

// Alias kept for API/documentation compatibility with the spec's "Viewer" role.
const VIEWER = ROLES.PARTICIPANT;

const ROLES_THAT_CONTROL_PLAYBACK = new Set([ROLES.HOST, ROLES.MODERATOR]);

function canControlPlayback(role) {
  return ROLES_THAT_CONTROL_PLAYBACK.has(role);
}

function canManageRoles(role) {
  return role === ROLES.HOST;
}

function canRemoveParticipants(role) {
  return role === ROLES.HOST;
}

function canTransferHost(role) {
  return role === ROLES.HOST;
}

// Host and moderators can review/approve a participant's control request.
function canReviewRequests(role) {
  return ROLES_THAT_CONTROL_PLAYBACK.has(role);
}

function isValidAssignableRole(role) {
  // Host cannot be assigned via assign_role - only via transfer_host.
  return role === ROLES.MODERATOR || role === ROLES.PARTICIPANT;
}

module.exports = {
  ROLES,
  VIEWER,
  canControlPlayback,
  canManageRoles,
  canRemoveParticipants,
  canTransferHost,
  canReviewRequests,
  isValidAssignableRole,
};

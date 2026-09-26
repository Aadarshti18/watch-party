import type { Participant, Role } from '../types';

interface ParticipantListProps {
  participants: Participant[];
  you: Participant;
  onAssignRole: (userId: string, role: Role) => void;
  onRemove: (userId: string) => void;
  onTransferHost: (userId: string) => void;
}

const ROLE_LABEL: Record<Role, string> = {
  host: 'Host',
  moderator: 'Moderator',
  participant: 'Participant',
};

export default function ParticipantList({
  participants,
  you,
  onAssignRole,
  onRemove,
  onTransferHost,
}: ParticipantListProps) {
  const isHost = you.role === 'host';
  const sorted = [...participants].sort((a, b) => {
    const rank = { host: 0, moderator: 1, participant: 2 };
    return rank[a.role] - rank[b.role] || a.joinedAt - b.joinedAt;
  });

  return (
    <div className="sidebar-panel">
      {sorted.map((p) => {
        const isSelf = p.userId === you.userId;
        return (
          <div key={p.userId} className={`participant-row role-${p.role}`} style={{ flexDirection: 'column', alignItems: 'stretch' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="participant-name">
                {p.username}
                {isSelf && ' (you)'}
              </span>
              <span className="participant-role">{ROLE_LABEL[p.role]}</span>
            </div>

            {isHost && !isSelf && (
              <div className="participant-actions">
                <select
                  value={p.role}
                  onChange={(e) => onAssignRole(p.userId, e.target.value as Role)}
                  aria-label={`Change ${p.username}'s role`}
                >
                  <option value="participant">Participant</option>
                  <option value="moderator">Moderator</option>
                </select>
                <button type="button" className="btn btn-secondary btn-small" onClick={() => onTransferHost(p.userId)}>
                  Make host
                </button>
                <button type="button" className="btn btn-danger btn-small" onClick={() => onRemove(p.userId)}>
                  Remove
                </button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

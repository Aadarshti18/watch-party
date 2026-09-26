import { Crown, Eye, ShieldCheck, UserMinus } from 'lucide-react';
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

const ROLE_ICON: Record<Role, typeof Crown> = {
  host: Crown,
  moderator: ShieldCheck,
  participant: Eye,
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
        const RoleIcon = ROLE_ICON[p.role];
        return (
          <div
            key={p.userId}
            className={`participant-row role-${p.role}`}
            style={{ flexDirection: 'column', alignItems: 'stretch' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="participant-avatar" aria-hidden="true">
                {p.username.charAt(0).toUpperCase()}
              </span>
              <span className="participant-name">
                {p.username}
                {isSelf && ' (you)'}
              </span>
              <span className="participant-role">
                <RoleIcon size={13} aria-hidden="true" />
                {ROLE_LABEL[p.role]}
              </span>
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
                  <Crown size={13} aria-hidden="true" />
                  Make host
                </button>
                <button type="button" className="btn btn-danger btn-small" onClick={() => onRemove(p.userId)}>
                  <UserMinus size={13} aria-hidden="true" />
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
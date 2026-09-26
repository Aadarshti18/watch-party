import { Check, CheckCircle2, Film, Pause, Play, SkipForward, X } from 'lucide-react';
import type { ControlAction, PendingRequest } from '../types';
import { formatTime } from '../utils';

interface PendingRequestsProps {
  requests: PendingRequest[];
  onApprove: (requestId: string) => void;
  onDeny: (requestId: string) => void;
}

const ACTION_ICON: Record<ControlAction, typeof Play> = {
  play: Play,
  pause: Pause,
  seek: SkipForward,
  change_video: Film,
};

function describe(request: PendingRequest): string {
  const payload = request.payload as Record<string, unknown> | null;
  switch (request.action) {
    case 'play':
      return 'wants to press play';
    case 'pause':
      return 'wants to pause';
    case 'seek': {
      const t = typeof payload?.time === 'number' ? payload.time : null;
      return t !== null ? `wants to jump to ${formatTime(t)}` : 'wants to seek';
    }
    case 'change_video':
      return 'wants to change the video';
    default:
      return 'wants to change playback';
  }
}

export default function PendingRequests({ requests, onApprove, onDeny }: PendingRequestsProps) {
  if (requests.length === 0) {
    return (
      <div className="empty-state">
        <CheckCircle2 size={26} aria-hidden="true" />
        <span>No pending requests right now.</span>
      </div>
    );
  }

  return (
    <div className="sidebar-panel">
      {requests.map((r) => {
        const ActionIcon = ACTION_ICON[r.action];
        return (
          <div key={r.requestId} className="request-row">
            <p>
              <ActionIcon size={14} className="request-action-icon" aria-hidden="true" />
              <strong>{r.username}</strong> {describe(r)}
            </p>
            <div className="request-actions">
              <button type="button" className="btn btn-primary btn-small" onClick={() => onApprove(r.requestId)}>
                <Check size={13} aria-hidden="true" />
                Approve
              </button>
              <button type="button" className="btn btn-secondary btn-small" onClick={() => onDeny(r.requestId)}>
                <X size={13} aria-hidden="true" />
                Deny
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
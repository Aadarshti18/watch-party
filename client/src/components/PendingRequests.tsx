import type { PendingRequest } from '../types';
import { formatTime } from '../utils';

interface PendingRequestsProps {
  requests: PendingRequest[];
  onApprove: (requestId: string) => void;
  onDeny: (requestId: string) => void;
}

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
    return <div className="empty-state">No pending requests right now.</div>;
  }

  return (
    <div className="sidebar-panel">
      {requests.map((r) => (
        <div key={r.requestId} className="request-row">
          <p>
            <strong>{r.username}</strong> {describe(r)}
          </p>
          <div className="request-actions">
            <button type="button" className="btn btn-primary btn-small" onClick={() => onApprove(r.requestId)}>
              Approve
            </button>
            <button type="button" className="btn btn-secondary btn-small" onClick={() => onDeny(r.requestId)}>
              Deny
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

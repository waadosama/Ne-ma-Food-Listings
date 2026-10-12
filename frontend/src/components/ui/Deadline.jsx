import { timeLeft, formatDateTime } from '../../utils/format.js';

// A pickup deadline, always shown with its exact timestamp on hover/focus so
// a relative label is never the only source of truth. Turns red once the
// window has closed — which is exactly when the backend stops accepting
// requests, approvals and collections for that listing.

export default function Deadline({ iso, size = 'md' }) {
  const { expired, urgent, text } = timeLeft(iso);

  const tone = expired ? 'expired' : urgent ? 'urgent' : 'ok';

  return (
    <time
      className={`deadline deadline--${tone} deadline--${size}`}
      dateTime={iso}
      title={formatDateTime(iso)}
    >
      <span className="deadline-icon" aria-hidden="true">
        {expired ? '⌛' : '◷'}
      </span>
      <span className="deadline-text">{text}</span>
      <span className="deadline-exact">{formatDateTime(iso)}</span>
    </time>
  );
}

import { EVENT_TYPE_LABELS, formatDateTime, formatNumber, ROLE_LABELS } from '../utils/format.js';

// The audit trail, rendered as it is stored: one row per state change from
// `GET /api/requests/:id`, oldest first.
//
// The `listingAvailableAfter` figure is deliberately shown — reading the
// column down the page is exactly how a reviewer confirms the reservation
// moved once and only once.

export default function RequestTimeline({ events }) {
  if (!events?.length) return null;

  return (
    <ol className="timeline">
      {events.map((event) => (
        <li className="timeline-item" key={event.id}>
          <span className="timeline-marker" aria-hidden="true" />
          <div className="timeline-content">
            <p className="timeline-label">{EVENT_TYPE_LABELS[event.eventType] ?? event.eventType}</p>

            <p className="timeline-meta">
              <time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
              {event.actorRole && <span> · بواسطة {ROLE_LABELS[event.actorRole] ?? event.actorRole}</span>}
              {event.fromStatus && (
                <span className="timeline-transition" dir="ltr">
                  {' '}
                  {event.fromStatus} → {event.toStatus}
                </span>
              )}
            </p>

            {event.note && <p className="timeline-note">{event.note}</p>}

            <p className="timeline-figures">
              {event.quantity != null && (
                <span>الكمية: {formatNumber(event.quantity)}</span>
              )}
              {event.listingAvailableAfter != null && (
                <span>
                  المتاح بعد العملية: {formatNumber(event.listingAvailableAfter)}
                </span>
              )}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}

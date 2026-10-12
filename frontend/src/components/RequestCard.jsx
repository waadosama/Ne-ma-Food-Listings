import Badge from './ui/Badge.jsx';
import StatusBadge from './StatusBadge.jsx';
import { requestQuantityText, formatDateTime } from '../utils/format.js';

// One food request, rendered for either side of the marketplace:
//
//   charity view    — the listing it is against, its status, and any note
//                     the restaurant left (`showListing`)
//   restaurant view — which charity asked, for how much, and their message
//                     (`showCharity`)
//
// Both are the same object from the API; only which optional block is
// emphasised differs. `actions` carries the buttons (approve, reject,
// cancel, confirm) so the card never decides permissions itself.

export default function RequestCard({ request, showListing, showCharity, actions, children }) {
  const listing = request.listing;
  const charity = request.charity;
  const pending = request.status === 'PENDING';
  const overdue = listing?.status === 'EXPIRED';

  return (
    <article className={`request-card request-card--${request.status.toLowerCase()}`}>
      <header className="request-card-head">
        <div className="request-card-title">
          {showListing && listing && (
            <span className="request-listing-name">{listing.foodName}</span>
          )}
          {showCharity && charity && (
            <span className="request-charity-name">
              {charity.name}
              {charity.city ? ` · ${charity.city}` : ''}
            </span>
          )}
          <span className="request-quantity">{requestQuantityText(request)}</span>
        </div>
        <StatusBadge kind="request" value={request.status} />
      </header>

      <dl className="request-facts">
        <div>
          <dt>أُرسل</dt>
          <dd>{formatDateTime(request.createdAt)}</dd>
        </div>
        {request.respondedAt && (
          <div>
            <dt>رُدّ عليه</dt>
            <dd>{formatDateTime(request.respondedAt)}</dd>
          </div>
        )}
        {showCharity && charity?.verificationStatus && (
          <div>
            <dt>حالة الجمعية</dt>
            <dd>
              <Badge tone={charity.verificationStatus === 'VERIFIED' ? 'success' : 'warning'}>
                {charity.verificationStatus === 'VERIFIED' ? 'معتمدة' : charity.verificationStatus}
              </Badge>
            </dd>
          </div>
        )}
        {showListing && listing?.pickupDeadline && (
          <div>
            <dt>آخر موعد للاستلام</dt>
            <dd>{formatDateTime(listing.pickupDeadline)}</dd>
          </div>
        )}
      </dl>

      {request.message && (
        <blockquote className="request-message">
          <p>{request.message}</p>
        </blockquote>
      )}

      {request.responseNote && (
        <p className="request-note">
          <strong>
            {request.status === 'REJECTED' ? 'سبب الرفض' : 'ملاحظة المطعّم'}:
          </strong>{' '}
          {request.responseNote}
        </p>
      )}

      {pending && !overdue && (
        <p className="request-hint">بانتظار قرار المطعّم.</p>
      )}
      {overdue && (request.status === 'PENDING' || request.status === 'ACCEPTED') && (
        <p className="request-hint request-hint--warn">
          انتهى موعد الاستلام لهذا العرض — لن يمكن إتمام العملية.
        </p>
      )}

      {children}

      {actions && <footer className="request-card-actions">{actions}</footer>}
    </article>
  );
}

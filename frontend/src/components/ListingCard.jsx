import { Link } from 'react-router-dom';
import QuantityBar from './ui/QuantityBar.jsx';
import Deadline from './ui/Deadline.jsx';
import StatusBadge from './StatusBadge.jsx';
import { CATEGORY_LABELS } from '../utils/format.js';

// The one card a food listing ever appears in — the home preview, the
// browse grid and the restaurant's own dashboard all render this; what
// differs is the `to` link and which `actions` are passed in.
//
// Quantity, pickup deadline, location and status are always shown: those
// four facts are what a charity actually decides on, and burying any of
// them on the detail page would make the grid useless.

export default function ListingCard({ listing, to, actions, footer, showOrganization = false }) {
  const exhausted = Number(listing.availableQuantity) <= 0;

  const title = to ? (
    <Link className="listing-title-link" to={to}>
      {listing.foodName}
    </Link>
  ) : (
    listing.foodName
  );

  return (
    <article className={`listing-card${exhausted ? ' listing-card--exhausted' : ''}`}>
      <header className="listing-card-head">
        <div className="listing-card-title">
          <span className="listing-category">
            {CATEGORY_LABELS[listing.category] ?? listing.category}
          </span>
          <h3>{title}</h3>
        </div>
        <StatusBadge kind="listing" value={listing.status} />
      </header>

      <div className="listing-card-body">
        {showOrganization && listing.organizationName && (
          <p className="listing-org">
            <span aria-hidden="true">⌂</span>
            <span>
              {listing.organizationName}
              {listing.organizationCity ? ` · ${listing.organizationCity}` : ''}
            </span>
          </p>
        )}

        <QuantityBar
          availableQuantity={listing.availableQuantity}
          totalQuantity={listing.totalQuantity}
          unit={listing.unit}
        />

        <dl className="listing-facts">
          <div>
            <dt>آخر موعد للاستلام</dt>
            <dd>
              <Deadline iso={listing.pickupDeadline} size="sm" />
            </dd>
          </div>
          <div>
            <dt>موقع الاستلام</dt>
            <dd className="listing-location">{listing.pickupLocation}</dd>
          </div>
          {listing.useByDeadline && (
            <div>
              <dt>صالح حتى</dt>
              <dd>{new Date(listing.useByDeadline).toLocaleDateString('ar-SA-u-ca-gregory-nu-latn')}</dd>
            </div>
          )}
        </dl>

        {listing.safetyInfo && (
          <p className="listing-safety">
            <span aria-hidden="true">⚠</span>
            <span>{listing.safetyInfo}</span>
          </p>
        )}

        {listing.description && <p className="listing-description">{listing.description}</p>}

        {footer}
      </div>

      {(actions || to) && (
        <footer className="listing-card-actions">
          {actions}
          {/* Only offer the detail link when the caller has not supplied its
              own actions — otherwise the card ends up with two buttons
              pointing at the same place. */}
          {to && !actions && (
            <Link className="btn btn--ghost btn--sm" to={to}>
              التفاصيل
              <span aria-hidden="true"> ←</span>
            </Link>
          )}
        </footer>
      )}
    </article>
  );
}

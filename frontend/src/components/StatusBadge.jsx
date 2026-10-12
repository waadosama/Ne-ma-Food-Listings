import Badge from './ui/Badge.jsx';
import {
  LISTING_STATUS_LABELS,
  REQUEST_STATUS_LABELS,
  VERIFICATION_LABELS,
  DONATION_STATUS_LABELS,
  statusTone,
} from '../utils/format.js';

const LABEL_SETS = {
  listing: LISTING_STATUS_LABELS,
  request: REQUEST_STATUS_LABELS,
  verification: VERIFICATION_LABELS,
  donation: DONATION_STATUS_LABELS,
};

// One status pill for every domain state. The label set is chosen by `kind`
// and the colour by `statusTone`, so the same status always looks the same
// wherever it appears — a PENDING request in a table and a PENDING
// organization in the admin queue use the identical chip.

export default function StatusBadge({ kind = 'listing', value, className = '' }) {
  const labels = LABEL_SETS[kind] ?? {};
  const label = labels[value] ?? value ?? '—';

  return (
    <Badge tone={statusTone(value)} className={className}>
      <span className="badge-dot" aria-hidden="true" />
      {label}
    </Badge>
  );
}

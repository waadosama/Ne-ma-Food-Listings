import { useState } from 'react';
import { listingsApi, ApiError } from '../../services/api.js';

// Cancelling a listing, with the reason the backend requires.
//
// `food_listings_cancellation_pairing` refuses a CANCELLED row without a
// reason — "spoiled", "collected early", "event cancelled" — because a
// withdrawal nobody can explain is useless to the charities that were
// counting on it. So the reason is collected here rather than sent as a
// generic default, and cancelling also settles every open request against
// the listing (the backend does that in the same transaction).

export default function ListingCancelAction({ listing, onCancelled, className = 'btn btn--danger-ghost btn--sm' }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (listing.status === 'CANCELLED') return null;

  async function handleSubmit(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await listingsApi.cancel(listing.id, reason.trim());
      setOpen(false);
      setReason('');
      onCancelled?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر إلغاء العرض.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" className={className} onClick={() => setOpen(true)}>
        إلغاء العرض
      </button>
    );
  }

  return (
    <form className="cancel-form" onSubmit={handleSubmit}>
      <label className="field-label" htmlFor={`cancel-reason-${listing.id}`}>
        سبب الإلغاء
      </label>
      <div className="cancel-form-row">
        <input
          id={`cancel-reason-${listing.id}`}
          className="input"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="مثال: أُرسلت طلبات تغطي الكمية كاملة"
          required
          minLength={3}
          disabled={busy}
        />
        <button type="submit" className="btn btn--danger btn--sm" disabled={busy}>
          {busy ? 'جارٍ الإلغاء…' : 'تأكيد الإلغاء'}
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => setOpen(false)}
          disabled={busy}
        >
          تراجع
        </button>
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
      <p className="cancel-form-hint">
        سيُلغى العرض وتُستبَح الطلبات المفتوحة عليه، وتُعاد الكميات المحجوزة.
      </p>
    </form>
  );
}

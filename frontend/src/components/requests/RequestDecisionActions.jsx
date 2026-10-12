import { useState } from 'react';
import { listingsApi, ApiError } from '../../services/api.js';

// Approve / reject, shared by the restaurant dashboard and the per-listing
// inbox.
//
// Approval needs no explanation; rejection does — the backend enforces a
// response note on REJECTED (`food_requests_rejection_needs_note`) and
// shows it to the charity, so the textarea appears only when it is needed.
// Either way the server re-checks that the listing is still owned by this
// organization, that the request is still PENDING, and that the quantity is
// still available.

export default function RequestDecisionActions({ listingId, request, onDecided, compact = false }) {
  const [mode, setMode] = useState('idle'); // 'idle' | 'reject'
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  if (request.status !== 'PENDING') return null;

  async function decide(decision, responseNote) {
    setBusy(true);
    setError(null);
    try {
      await listingsApi.decide(listingId, request.id, {
        decision,
        ...(responseNote ? { responseNote } : {}),
      });
      setMode('idle');
      setNote('');
      onDecided?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر تنفيذ القرار.');
    } finally {
      setBusy(false);
    }
  }

  function handleApprove() {
    return decide('ACCEPTED');
  }

  function handleReject(event) {
    event.preventDefault();
    if (!note.trim()) {
      setError('اكتب سبب الرفض ليصل إلى الجمعية.');
      return;
    }
    return decide('REJECTED', note.trim());
  }

  if (mode === 'reject') {
    return (
      <form className={`decision-form${compact ? ' decision-form--compact' : ''}`} onSubmit={handleReject}>
        <label className="field-label" htmlFor={`reject-note-${request.id}`}>
          سبب الرفض <span className="field-required" aria-hidden="true">*</span>
        </label>
        <textarea
          id={`reject-note-${request.id}`}
          className="input textarea"
          rows={3}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="مثال: الكمية محجوزة بالكامل لطلب آخر"
          disabled={busy}
          autoFocus
        />
        {error && <p className="field-error" role="alert">{error}</p>}
        <div className="decision-actions">
          <button type="submit" className="btn btn--danger btn--sm" disabled={busy}>
            {busy ? 'جارٍ الرفض…' : 'تأكيد الرفض'}
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => { setMode('idle'); setError(null); }}
            disabled={busy}
          >
            تراجع
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className={`decision-actions${error ? ' decision-actions--error' : ''}`}>
      <button
        type="button"
        className="btn btn--success btn--sm"
        onClick={handleApprove}
        disabled={busy}
      >
        {busy ? 'جارٍ…' : 'موافقة وحجز الكمية'}
      </button>
      <button
        type="button"
        className="btn btn--danger-ghost btn--sm"
        onClick={() => { setMode('reject'); setError(null); }}
        disabled={busy}
      >
        رفض
      </button>
      {error && <p className="field-error" role="alert">{error}</p>}
    </div>
  );
}

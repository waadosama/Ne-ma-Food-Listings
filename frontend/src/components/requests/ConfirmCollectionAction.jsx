import { useState } from 'react';
import { requestsApi, ApiError } from '../../services/api.js';

// "I have the food" — the charity's collection confirmation.
//
// This is the only call in the API that writes a donation row, so it is
// deliberately explicit: the charity confirms, optionally records what
// actually changed hands, and the backend then completes the request and
// retires the listing if nothing is left. The collected quantity is decided
// by the server from the approved request — there is no quantity input here
// because there is nothing for the client to get wrong.

export default function ConfirmCollectionAction({ request, onConfirmed }) {
  const [open, setOpen] = useState(false);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function handleConfirm(event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await requestsApi.collect(request.id, notes.trim() || undefined);
      setOpen(false);
      setNotes('');
      onConfirmed?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر تأكيد الاستلام.');
    } finally {
      setBusy(false);
    }
  }

  if (request.status !== 'ACCEPTED') return null;

  if (!open) {
    return (
      <button type="button" className="btn btn--success btn--sm" onClick={() => setOpen(true)}>
        تأكيد استلام الطعام
      </button>
    );
  }

  return (
    <form className="decision-form" onSubmit={handleConfirm}>
      <p className="confirm-lead">
        أكّد أنك استلمت {request.requestedQuantity} {request.unit === 'PORTIONS' ? 'حصة' : request.unit}. سيُقيَّد
        التبرع فوراً ويُحدَّث رصيد العرض.
      </p>

      <label className="field-label" htmlFor={`collect-notes-${request.id}`}>
        ملاحظات التسليم (اختياري)
      </label>
      <textarea
        id={`collect-notes-${request.id}`}
        className="input textarea"
        rows={2}
        value={notes}
        onChange={(event) => setNotes(event.target.value)}
        placeholder="مثال: استُلمت 3 صناديق مغلقة، المتطوع وصل في الموعد"
        disabled={busy}
      />

      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      <div className="decision-actions">
        <button type="submit" className="btn btn--success btn--sm" disabled={busy}>
          {busy ? 'جارٍ التأكيد…' : 'نعم، استلمت'}
        </button>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={() => { setOpen(false); setError(null); }}
          disabled={busy}
        >
          تراجع
        </button>
      </div>
    </form>
  );
}

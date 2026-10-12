import { useState } from 'react';

// A button that asks twice.
//
// Destructive or hard-to-reverse actions (cancelling a listing, cancelling
// an approved reservation) use this instead of `window.confirm`: it stays in
// the document flow, is keyboard reachable, and can carry Arabic copy that
// explains what is about to happen.

export default function ConfirmAction({
  label,
  confirmLabel = 'تأكيد',
  cancelLabel = 'تراجع',
  onConfirm,
  disabled,
  className = 'btn btn--danger-ghost btn--sm',
  confirmClassName = 'btn btn--danger btn--sm',
  children,
}) {
  const [armed, setArmed] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleConfirm() {
    setBusy(true);
    try {
      await onConfirm();
      setArmed(false);
    } catch {
      // The caller shows its own error; leave the confirmation open so the
      // user can retry rather than silently appearing to have succeeded.
    } finally {
      setBusy(false);
    }
  }

  if (!armed) {
    return (
      <button
        type="button"
        className={className}
        disabled={disabled}
        onClick={() => setArmed(true)}
      >
        {label}
      </button>
    );
  }

  return (
    <span className="confirm-action" role="group" aria-label={label}>
      <span className="confirm-action-text">{children || `تأكيد: ${label}؟`}</span>
      <button
        type="button"
        className={confirmClassName}
        onClick={handleConfirm}
        disabled={busy}
        autoFocus
      >
        {busy ? '…' : confirmLabel}
      </button>
      <button
        type="button"
        className="btn btn--ghost btn--sm"
        onClick={() => setArmed(false)}
        disabled={busy}
      >
        {cancelLabel}
      </button>
    </span>
  );
}

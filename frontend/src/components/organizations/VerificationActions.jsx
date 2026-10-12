import { useState } from 'react';
import { organizationsApi, ApiError } from '../../services/api.js';

// Approve or reject an organization.
//
// Same two-step pattern as every other destructive action in the app: pick a
// decision, say why, send it. The backend rejects a no-op decision
// (400 ALREADY_IN_STATUS), so the button for the organization's *current*
// status is not offered at all rather than being shown and then refused.

export default function VerificationActions({ organization, onDecided }) {
  const [decision, setDecision] = useState(null); // 'VERIFIED' | 'REJECTED'
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  async function submit(event) {
    event.preventDefault();
    if (decision === 'REJECTED' && note.trim().length < 3) {
      setError('اكتب سبباً مختصراً لرفض المنظّم.');
      return;
    }

    setBusy(true);
    setError(null);
    try {
      await organizationsApi.verify(organization.id, {
        decision,
        ...(note.trim() ? { note: note.trim() } : {}),
      });
      setDecision(null);
      setNote('');
      onDecided?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'تعذّر حفظ القرار.');
    } finally {
      setBusy(false);
    }
  }

  if (decision) {
    return (
      <form className="decision-form" onSubmit={submit}>
        <p className="confirm-lead">
          {decision === 'VERIFIED'
            ? `اعتماد «${organization.name}» يتيح له النشر والطلب فوراً.`
            : `رفض «${organization.name}» يمنعه من المشاركة حتى إعادة المراجعة.`}
        </p>

        <label className="field-label" htmlFor={`verify-note-${organization.id}`}>
          الملاحظة {decision === 'REJECTED' ? '' : '(اختياري)'}
        </label>
        <textarea
          id={`verify-note-${organization.id}`}
          className="input textarea"
          rows={2}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder={
            decision === 'VERIFIED' ? 'تم التحقق من السجلات' : 'السجلات غير مكتملة'
          }
          disabled={busy}
          autoFocus
        />

        {error && <p className="field-error" role="alert">{error}</p>}

        <div className="decision-actions">
          <button
            type="submit"
            className={decision === 'VERIFIED' ? 'btn btn--success btn--sm' : 'btn btn--danger btn--sm'}
            disabled={busy}
          >
            {busy ? 'جارٍ الحفظ…' : 'تأكيد القرار'}
          </button>
          <button
            type="button"
            className="btn btn--ghost btn--sm"
            onClick={() => { setDecision(null); setError(null); }}
            disabled={busy}
          >
            تراجع
          </button>
        </div>
      </form>
    );
  }

  return (
    <div className="decision-actions">
      {organization.verificationStatus !== 'VERIFIED' && (
        <button
          type="button"
          className="btn btn--success btn--sm"
          onClick={() => setDecision('VERIFIED')}
        >
          اعتماد
        </button>
      )}
      {organization.verificationStatus !== 'REJECTED' && (
        <button
          type="button"
          className="btn btn--danger-ghost btn--sm"
          onClick={() => setDecision('REJECTED')}
        >
          رفض
        </button>
      )}
      {organization.verificationStatus === 'VERIFIED' && (
        <span className="decision-note">معتمد — يمكن سحب الاعتماد بالرفض.</span>
      )}
      {organization.verificationStatus === 'REJECTED' && (
        <span className="decision-note">مرفوض — يمكن اعتماده لاحقاً.</span>
      )}
    </div>
  );
}

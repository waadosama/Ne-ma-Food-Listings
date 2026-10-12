import { ApiError } from '../../services/api.js';

// A failed load, in the caller's language, with whatever the backend told us.
//
// The backend's `message` is written to be shown to people, so it is used
// verbatim; `code` is printed as a small machine-readable tag so a user can
// quote it in a bug report without us having to log anywhere.

export default function ErrorState({ error, onRetry, title = 'تعذّر تحميل البيانات' }) {
  const apiError = error instanceof ApiError ? error : null;
  const message =
    apiError?.message || error?.message || 'حدث خطأ غير متوقع. حاول مرة أخرى.';

  const fieldErrors = apiError?.fieldErrors();
  const fields = fieldErrors ? Object.entries(fieldErrors) : [];

  return (
    <div className="state state--error" role="alert">
      <span className="state-icon" aria-hidden="true">!</span>
      <p className="state-title">{title}</p>
      <p className="state-hint">{message}</p>

      {fields.length > 0 && (
        <ul className="state-details">
          {fields.map(([field, text]) => (
            <li key={field}>
              <code dir="ltr">{field}</code> {text}
            </li>
          ))}
        </ul>
      )}

      {apiError?.code && (
        <p className="state-code" dir="ltr">
          {apiError.status ? `${apiError.status} · ` : ''}
          {apiError.code}
        </p>
      )}

      {onRetry && (
        <button type="button" className="btn btn--ghost" onClick={onRetry}>
          إعادة المحاولة
        </button>
      )}
    </div>
  );
}

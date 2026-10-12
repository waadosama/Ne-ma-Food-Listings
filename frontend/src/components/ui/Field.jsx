// Form primitives. Every input in the app goes through these so labels,
// hints, error text and focus states are identical everywhere, and so a
// backend `details[]` entry can be attached to exactly one field.

export function Field({ label, htmlFor, hint, error, required, children }) {
  const hintId = hint && htmlFor ? `${htmlFor}-hint` : undefined;
  const errorId = error && htmlFor ? `${htmlFor}-error` : undefined;

  return (
    <div className={`field${error ? ' field--error' : ''}`}>
      <label className="field-label" htmlFor={htmlFor}>
        {label}
        {required && (
          <span className="field-required" aria-hidden="true">
            *
          </span>
        )}
      </label>
      {hint && (
        <p className="field-hint" id={hintId}>
          {hint}
        </p>
      )}
      {/* The control receives aria-describedby via props from the caller so
          that hint and error are both announced. */}
      {children}
      {error && (
        <p className="field-error" id={errorId} role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

export function TextField({ label, name, hint, error, required, className = '', ...props }) {
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = error ? `${name}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <Field label={label} htmlFor={name} hint={hint} error={error} required={required}>
      <input
        id={name}
        name={name}
        className={`input ${className}`.trim()}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        required={required}
        {...props}
      />
    </Field>
  );
}

export function TextAreaField({ label, name, hint, error, required, className = '', ...props }) {
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = error ? `${name}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <Field label={label} htmlFor={name} hint={hint} error={error} required={required}>
      <textarea
        id={name}
        name={name}
        className={`input textarea ${className}`.trim()}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        required={required}
        {...props}
      />
    </Field>
  );
}

export function SelectField({
  label,
  name,
  hint,
  error,
  required,
  options = [],
  className = '',
  ...props
}) {
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = error ? `${name}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined;

  return (
    <Field label={label} htmlFor={name} hint={hint} error={error} required={required}>
      <select
        id={name}
        name={name}
        className={`input select ${className}`.trim()}
        aria-invalid={error ? 'true' : undefined}
        aria-describedby={describedBy}
        required={required}
        {...props}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </Field>
  );
}

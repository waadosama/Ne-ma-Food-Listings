// Inline result banner for a completed action: the success/error state the
// forms and action buttons need. Announced to assistive technology via
// role="status" / role="alert".

export default function Alert({ tone = 'info', title, children, onDismiss }) {
  const role = tone === 'error' ? 'alert' : 'status';

  return (
    <div className={`alert alert--${tone}`} role={role}>
      <div className="alert-body">
        {title && <strong className="alert-title">{title}</strong>}
        {children && <div className="alert-text">{children}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          className="alert-dismiss"
          onClick={onDismiss}
          aria-label="إغلاق التنبيه"
        >
          ×
        </button>
      )}
    </div>
  );
}

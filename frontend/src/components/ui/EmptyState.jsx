// "There is genuinely nothing here" — distinct from an error, and distinct
// from a still-loading screen. Every list in the app picks one of the three
// so an empty dashboard never looks broken.

export default function EmptyState({
  title = 'لا توجد بيانات بعد',
  hint,
  action,
  icon,
}) {
  return (
    <div className="state state--empty">
      <span className="state-icon" aria-hidden="true">
        {icon || '◇'}
      </span>
      <p className="state-title">{title}</p>
      {hint && <p className="state-hint">{hint}</p>}
      {action}
    </div>
  );
}

// Loading indicator. Used for first loads and background refreshes so the
// app never renders an empty screen that looks like "no data".

export default function Loading({ label = 'جارٍ التحميل…', full = false }) {
  return (
    <div
      className={full ? 'state state--full' : 'state'}
      role="status"
      aria-live="polite"
    >
      <span className="spinner" aria-hidden="true" />
      <p className="state-title">{label}</p>
    </div>
  );
}

import { formatNumber } from '../../utils/format.js';

// One number with its meaning. Dashboards are built from a row of these so
// every figure is labelled and announced consistently.

export default function StatCard({ label, value, hint, tone = 'neutral', icon }) {
  return (
    <div className={`stat stat--${tone}`}>
      {icon && (
        <span className="stat-icon" aria-hidden="true">
          {icon}
        </span>
      )}
      <div className="stat-body">
        <span className="stat-value">{formatNumber(value)}</span>
        <span className="stat-label">{label}</span>
        {hint && <span className="stat-hint">{hint}</span>}
      </div>
    </div>
  );
}

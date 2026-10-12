import { UNIT_LABELS } from '../../utils/format.js';

// "34 من 60 حصة" as a bar. The number is always printed as text as well, so
// the bar is a supplement to the quantity rather than the only way to read it.

export default function QuantityBar({ availableQuantity, totalQuantity, unit, showText = true }) {
  const total = Number(totalQuantity) || 0;
  const available = Number(availableQuantity) || 0;
  const reserved = Math.max(0, total - available);
  const pct = total > 0 ? Math.round((available / total) * 100) : 0;
  const unitLabel = UNIT_LABELS[unit] ?? unit ?? '';

  const tone = available <= 0 ? 'empty' : pct <= 25 ? 'low' : pct <= 60 ? 'mid' : 'high';

  return (
    <div className="quantity">
      <div
        className={`quantity-bar quantity-bar--${tone}`}
        role="meter"
        aria-valuenow={available}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-label={
          unitLabel
            ? `${available} من ${total} ${unitLabel} متاحة`
            : `${available} من ${total} متاح`
        }
      >
        <span
          className="quantity-fill"
          style={{ inlineSize: `${pct}%` }}
          aria-hidden="true"
        />
      </div>
      {showText && (
        <p className="quantity-text">
          <strong>
            {available}
            {unitLabel ? ` ${unitLabel}` : ''} متاحة
          </strong>
          <span>
            {reserved > 0
              ? ` · ${reserved}${unitLabel ? ` ${unitLabel}` : ''} محجوزة من أصل ${total}`
              : ` · من أصل ${total}`}
          </span>
        </p>
      )}
    </div>
  );
}

// Aggregations over real API responses — kept out of the pages so both
// dashboards count donations the same way.
//
// Quantities are grouped by unit rather than added blindly: 40 PORTIONS and
// 30 BOXES are not 70 of anything, and a dashboard that said "70" would be
// inventing a number the API never produced.

import { UNIT_LABELS, formatNumber } from './format.js';

export function sumByUnit(items, quantityKey = 'requestedQuantity', unitKey = 'unit') {
  const totals = new Map();

  for (const item of items) {
    const unit = item[unitKey] ?? 'UNIT';
    const value = Number(item[quantityKey]) || 0;
    totals.set(unit, (totals.get(unit) ?? 0) + value);
  }

  return [...totals.entries()].map(([unit, total]) => ({
    unit: unit === 'UNIT' ? null : unit,
    total,
  }));
}

// "40 حصة · 30 صندوق" — or "—" when there is nothing to show.
export function formatQuantitySummary(items, quantityKey, unitKey) {
  const sums = sumByUnit(items, quantityKey, unitKey);
  if (sums.length === 0) return '—';
  return sums
    .map(({ unit, total }) => {
      const label = UNIT_LABELS[unit] ?? (unit ? unit : '');
      return label ? `${formatNumber(total)} ${label}` : formatNumber(total);
    })
    .join(' · ');
}

export function countByStatus(items, ...statuses) {
  return items.filter((item) => statuses.includes(item.status)).length;
}

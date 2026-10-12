// Small status pill. `tone` drives colour; the label is always supplied by
// the caller (see utils/format.js), so a status the labels map does not know
// still renders as readable text rather than an empty chip.

export default function Badge({ tone = 'neutral', children, className = '' }) {
  return (
    <span className={`badge badge--${tone} ${className}`.trim()}>{children}</span>
  );
}

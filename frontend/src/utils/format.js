// Labels, dates and quantities — presentation helpers with no React and no
// network access, so components stay focused on layout and the API layer
// stays focused on transport.
//
// Everything is Arabic-first and RTL-aware. Dates go through Intl with an
// explicit Gregorian calendar and Latin digits: `ar-SA` defaults to the
// Islamic calendar, which would quietly disagree with every timestamp the
// backend prints.

const DATE_LOCALE = 'ar-SA-u-ca-gregory-nu-latn';

function safeFormat(iso, options) {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  try {
    return new Intl.DateTimeFormat(DATE_LOCALE, options).format(date);
  } catch {
    return date.toLocaleString();
  }
}

export function formatDateTime(iso) {
  return safeFormat(iso, { dateStyle: 'medium', timeStyle: 'short' });
}

export function formatDate(iso) {
  return safeFormat(iso, { dateStyle: 'medium' });
}

export function formatTime(iso) {
  return safeFormat(iso, { timeStyle: 'short' });
}

export function formatNumber(value) {
  const n = Number(value);
  if (Number.isNaN(n)) return '0';
  // Two decimals at most, and no trailing ".00" on whole numbers — these
  // are quantities people read at a glance, not financial figures.
  return new Intl.NumberFormat('ar-SA-u-ca-gregory-nu-latn', {
    maximumFractionDigits: 2,
  }).format(n);
}

// ---------------------------------------------------------------------
// Deadlines
// ---------------------------------------------------------------------

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

// "متبقٍ ساعتان و15 دقيقة" / "انتهى قبل 3 ساعات".
export function timeLeft(iso) {
  const target = new Date(iso).getTime();
  if (Number.isNaN(target)) return { expired: false, urgent: false, text: '—' };

  const diff = target - Date.now();

  if (diff <= 0) {
    const behind = Math.min(Math.abs(diff), DAY * 30);
    return {
      expired: true,
      urgent: true,
      text: `انتهى ${agoText(behind)}`,
    };
  }

  if (diff < HOUR) {
    const minutes = Math.max(1, Math.round(diff / MINUTE));
    return { expired: false, urgent: diff < 30 * MINUTE, text: `متبقٍ ${plural(minutes, 'دقيقة', 'دقيقتان', 'دقائق', 'دقيقة')}` };
  }
  if (diff < DAY) {
    const hours = Math.floor(diff / HOUR);
    const minutes = Math.round((diff % HOUR) / MINUTE);
    const hoursText = plural(hours, 'ساعة', 'ساعتان', 'ساعات', 'ساعة');
    if (minutes === 0) return { expired: false, urgent: diff < 2 * HOUR, text: `متبقٍ ${hoursText}` };
    return {
      expired: false,
      urgent: diff < 2 * HOUR,
      text: `متبقٍ ${hoursText} و${plural(minutes, 'دقيقة', 'دقيقتان', 'دقائق', 'دقيقة')}`,
    };
  }

  const days = Math.floor(diff / DAY);
  return { expired: false, urgent: false, text: `متبقٍ ${plural(days, 'يوم', 'يومان', 'أيام', 'يوم')}` };
}

function agoText(ms) {
  if (ms < HOUR) return `قبل ${plural(Math.max(1, Math.round(ms / MINUTE)), 'دقيقة', 'دقيقتان', 'دقائق', 'دقيقة')}`;
  if (ms < DAY) return `قبل ${plural(Math.floor(ms / HOUR), 'ساعة', 'ساعتان', 'ساعات', 'ساعة')}`;
  return `قبل ${plural(Math.floor(ms / DAY), 'يوم', 'يومان', 'أيام', 'يوم')}`;
}

// Arabic has real dual and plural forms; using one form for every count is
// the fastest way to make an Arabic UI read as machine-translated.
function plural(count, one, two, many, zero) {
  if (count === 0) return `لا يوجد ${zero}`;
  if (count === 1) return `${count} ${one}`;
  if (count === 2) return `${count} ${two}`;
  if (count >= 3 && count <= 10) return `${count} ${many}`;
  return `${count} ${one}`;
}

// ---------------------------------------------------------------------
// Domain labels
// ---------------------------------------------------------------------

export const UNIT_LABELS = {
  PORTIONS: 'حصة',
  KILOGRAMS: 'كجم',
  LITRES: 'لتر',
  ITEMS: 'قطعة',
  BOXES: 'صندوق',
};

export const CATEGORY_LABELS = {
  BAKERY: 'مخبوزات',
  PREPARED_MEALS: 'وجبات جاهزة',
  PRODUCE: 'خضار وفواكه',
  DAIRY: 'ألبان',
  MEAT: 'لحوم',
  PACKAGED: 'معلّبات',
  OTHER: 'أخرى',
};

export const ORG_TYPE_LABELS = {
  RESTAURANT: 'مطعم',
  BAKERY: 'مخبز',
  GROCERY: 'بقالة',
  CHARITY: 'جمعية خيرية',
  NGO: 'منظمة غير ربحية',
};

export const ROLE_LABELS = {
  ADMIN: 'مدير المنصة',
  RESTAURANT: 'مطعّم',
  CHARITY: 'جمعية خيرية',
};

export const LISTING_STATUS_LABELS = {
  ACTIVE: 'متاح',
  RESERVED: 'محجوز بالكامل',
  COMPLETED: 'اكتمل',
  EXPIRED: 'انتهى وقت الاستلام',
  CANCELLED: 'ملغى',
};

export const REQUEST_STATUS_LABELS = {
  PENDING: 'قيد المراجعة',
  ACCEPTED: 'مقبول',
  REJECTED: 'مرفوض',
  CANCELLED: 'ملغى',
  COMPLETED: 'تم الاستلام',
};

export const VERIFICATION_LABELS = {
  PENDING: 'بانتظار الاعتماد',
  VERIFIED: 'معتمد',
  REJECTED: 'مرفوض',
  SUSPENDED: 'موقوف',
};

export const DONATION_STATUS_LABELS = {
  COLLECTED: 'تم الاستلام',
  IN_TRANSIT: 'قيد التوزيع',
  DELIVERED: 'تم التسليم',
};

export const EVENT_TYPE_LABELS = {
  REQUESTED: 'تم إنشاء الطلب',
  APPROVED: 'قامت المطعّم بالموافقة',
  REJECTED: 'قامت المطعّم بالرفض',
  CANCELLED: 'ألغت الجمعية الطلب',
  COLLECTION_CONFIRMED: 'أكّدت الجمعية استلام الطعام',
  LISTING_CANCELLED: 'أُلغي العرض',
};

// Badge tone per value. Keys are checked against each map in turn, so a
// status the backend adds later falls back to a neutral tone instead of
// rendering as "undefined".
const TONES = {
  ACTIVE: 'success',
  VERIFIED: 'success',
  ACCEPTED: 'success',
  COMPLETED: 'success',
  DELIVERED: 'success',

  PENDING: 'warning',
  RESERVED: 'info',
  IN_TRANSIT: 'info',

  REJECTED: 'danger',
  CANCELLED: 'danger',
  EXPIRED: 'danger',
  SUSPENDED: 'danger',
};

export function statusTone(status) {
  return TONES[status] || 'neutral';
}

export function unitLabel(unit, value) {
  const label = UNIT_LABELS[unit] ?? unit ?? '';
  return label ? `${formatNumber(value)} ${label}` : formatNumber(value);
}

// "12 من 40 حصة متاحة" — the sentence a listing card leads with.
export function availabilityText(listing) {
  const unit = UNIT_LABELS[listing.unit] ?? listing.unit ?? '';
  const available = formatNumber(listing.availableQuantity);
  const total = formatNumber(listing.totalQuantity);
  if (!unit) return `${available} / ${total}`;
  return `${available} من ${total} ${unit}`;
}

export function requestQuantityText(request) {
  return unitLabel(request.unit, request.requestedQuantity);
}

import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { listingsApi, ApiError } from '../services/api.js';
import { useAuth } from '../context/AuthContext.jsx';
import useAsync from '../hooks/useAsync.js';
import Alert from '../components/ui/Alert.jsx';
import Loading from '../components/ui/Loading.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import { TextField, TextAreaField, SelectField } from '../components/ui/Field.jsx';
import { CATEGORY_LABELS, UNIT_LABELS } from '../utils/format.js';

// Create and edit share one form: the same fields, the same endpoint
// (POST to create, PATCH to edit), and the same backend validation.
//
// `availableQuantity` and `status` are absent from the field list on
// purpose — the API rejects unknown keys, and those two only ever move as
// requests are decided.

const CATEGORY_OPTIONS = Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label }));
const UNIT_OPTIONS = Object.entries(UNIT_LABELS).map(([value, label]) => ({ value, label }));

const INITIAL = {
  foodName: '',
  description: '',
  category: 'OTHER',
  safetyInfo: '',
  totalQuantity: '',
  unit: 'PORTIONS',
  pickupLocation: '',
  pickupDeadline: '',
  useByDeadline: '',
};

// <input type="datetime-local"> speaks local wall-clock time; the API speaks
// ISO-8601 instants. Both directions live here so no page has to think
// about the conversion.
function toLocalInput(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value) {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return date.toISOString();
}

function toFutureInput(minutesFromNow) {
  const date = new Date(Date.now() + minutesFromNow * 60_000);
  return toLocalInput(date.toISOString());
}

export default function ListingFormPage() {
  const { id } = useParams();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const { isVerified } = useAuth();

  const existing = useAsync(() => (isEdit ? listingsApi.get(id) : Promise.resolve(null)), [id, isEdit]);

  const [values, setValues] = useState(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [saved, setSaved] = useState(null);

  // Populate the edit form once the listing arrives.
  useEffect(() => {
    const listing = existing.data?.listing;
    if (!listing) return;
    setValues({
      foodName: listing.foodName ?? '',
      description: listing.description ?? '',
      category: listing.category ?? 'OTHER',
      safetyInfo: listing.safetyInfo ?? '',
      totalQuantity: String(listing.totalQuantity ?? ''),
      unit: listing.unit ?? 'PORTIONS',
      pickupLocation: listing.pickupLocation ?? '',
      pickupDeadline: toLocalInput(listing.pickupDeadline),
      useByDeadline: toLocalInput(listing.useByDeadline),
    });
  }, [existing.data]);

  function handleChange(event) {
    const { name, value } = event.target;
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  function validate() {
    const problems = {};

    if (!values.foodName.trim()) problems.foodName = 'اسم الطعام مطلوب.';
    if (!values.pickupLocation.trim()) problems.pickupLocation = 'موقع الاستلام مطلوب.';
    if (!values.pickupDeadline) {
      problems.pickupDeadline = 'حدّد آخر موعد للاستلام.';
    } else if (new Date(values.pickupDeadline).getTime() <= Date.now()) {
      problems.pickupDeadline = 'يجب أن يكون الموعد في المستقبل.';
    }
    if (values.useByDeadline && new Date(values.useByDeadline).getTime() <= Date.now()) {
      problems.useByDeadline = 'يجب أن يكون الموعد في المستقبل.';
    }
    if (!isEdit) {
      const total = Number(values.totalQuantity);
      if (!Number.isFinite(total) || total <= 0) {
        problems.totalQuantity = 'أدخل كمية أكبر من صفر.';
      }
    } else if (values.totalQuantity !== '') {
      const total = Number(values.totalQuantity);
      const available = Number(existing.data?.listing?.availableQuantity ?? 0);
      if (!Number.isFinite(total) || total < available) {
        problems.totalQuantity = `لا يمكن أن تقل عن الكمية المحجوزة (${available}).`;
      }
    }

    return problems;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    const problems = validate();
    if (Object.keys(problems).length > 0) {
      setFieldErrors(problems);
      return;
    }

    const payload = {
      foodName: values.foodName.trim(),
      description: values.description.trim() || undefined,
      category: values.category,
      safetyInfo: values.safetyInfo.trim() || undefined,
      totalQuantity: values.totalQuantity === '' ? undefined : Number(values.totalQuantity),
      unit: values.unit,
      pickupLocation: values.pickupLocation.trim(),
      pickupDeadline: fromLocalInput(values.pickupDeadline),
      useByDeadline: values.useByDeadline ? fromLocalInput(values.useByDeadline) : undefined,
    };

    // The PATCH endpoint requires at least one field; dropping the
    // undefined ones here keeps an untouched edit from sending an empty body.
    for (const key of Object.keys(payload)) {
      if (payload[key] === undefined) delete payload[key];
    }

    setSubmitting(true);
    try {
      const result = isEdit
        ? await listingsApi.update(id, payload)
        : await listingsApi.create(payload);

      setSaved(result.listing);
      if (!isEdit) navigate('/restaurant');
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.fieldErrors());
      } else {
        setError('تعذّر حفظ العرض. حاول مرة أخرى.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (isEdit && existing.status === 'loading') return <Loading full label="جارٍ تحميل العرض…" />;
  if (isEdit && existing.status === 'error') {
    return (
      <section className="page page--centered">
        <ErrorState error={existing.error} onRetry={existing.reload} />
        <div className="page-actions">
          <Link className="btn btn--ghost" to="/restaurant">العودة إلى لوحتي</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="page page--wide">
      <nav className="breadcrumb" aria-label="مسار التنقل">
        <Link to="/restaurant">لوحتي</Link>
        <span aria-hidden="true">/</span>
        <span>{isEdit ? 'تعديل العرض' : 'عرض جديد'}</span>
      </nav>

      <div className="page-intro">
        <span className="eyebrow">{isEdit ? 'تحديث البيانات' : 'مشاركة الفائض'}</span>
        <h1>{isEdit ? 'تعديل العرض' : 'إنشاء عرض جديد'}</h1>
        <p className="page-lede">
          الكمية، موعد الاستلام، والموقع هي ما تقرّر عليه الجمعيات. كلما كانت
          أدق، قلّت الطلبات المتعثّرة.
        </p>
      </div>

      {!isVerified && (
        <Alert tone="warning" title="منظّمك بانتظار الاعتماد">
          يمكنك تعبئة النموذج الآن، لكن حفظ العرض سيُرفض حتى يعتمد مسؤول
          المنصّة منظمك.
        </Alert>
      )}

      {saved && (
        <Alert tone="success" title={isEdit ? 'تم تحديث العرض' : 'تم نشر العرض'}>
          {isEdit ? (
            <>
              تم حفظ التغييرات على «{saved.foodName}».{' '}
              <Link to={`/restaurant/listings/${saved.id}/requests`}>عرض الطلبات</Link>
            </>
          ) : (
            <>
              «{saved.foodName}» متاح الآن للجمعيات المعتمدة.{' '}
              <Link to="/restaurant">العودة إلى لوحتي</Link>
            </>
          )}
        </Alert>
      )}

      <form className="card form" onSubmit={handleSubmit} noValidate>
        {error && <Alert tone="error" title="تعذّر الحفظ">{error}</Alert>}

        <div className="form-grid">
          <TextField
            label="اسم الطعام"
            name="foodName"
            required
            maxLength={200}
            placeholder="مثال: خبز وحلويات نهاية اليوم"
            value={values.foodName}
            onChange={handleChange}
            error={fieldErrors.foodName}
          />
          <SelectField
            label="الفئة"
            name="category"
            options={CATEGORY_OPTIONS}
            value={values.category}
            onChange={handleChange}
            error={fieldErrors.category}
          />
        </div>

        <TextAreaField
          label="الوصف"
          name="description"
          rows={2}
          placeholder="ما الذي يشمله الفائض، وكيف تم تجهيزه."
          value={values.description}
          onChange={handleChange}
          error={fieldErrors.description}
        />

        <div className="form-grid">
          <TextField
            label="الكمية الإجمالية"
            name="totalQuantity"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0.01"
            required={!isEdit}
            hint={
              isEdit
                ? 'لا يمكن أن تقل عن الكمية المحجوزة بالطلبات المقبولة.'
                : 'الكمية الكاملة المتاحة في هذا العرض.'
            }
            value={values.totalQuantity}
            onChange={handleChange}
            error={fieldErrors.totalQuantity}
          />
          <SelectField
            label="وحدة القياس"
            name="unit"
            options={UNIT_OPTIONS}
            value={values.unit}
            onChange={handleChange}
            error={fieldErrors.unit}
          />
        </div>

        <TextField
          label="موقع الاستلام"
          name="pickupLocation"
          required
          maxLength={500}
          placeholder="العنوان الذي يحضر إليه المتطوعون"
          value={values.pickupLocation}
          onChange={handleChange}
          error={fieldErrors.pickupLocation}
        />

        <div className="form-grid">
          <TextField
            label="آخر موعد للاستلام"
            name="pickupDeadline"
            type="datetime-local"
            required
            hint="بعد هذا الوقت يتوقف العرض عن قبول الطلبات تلقائياً."
            value={values.pickupDeadline}
            onChange={handleChange}
            error={fieldErrors.pickupDeadline}
          />
          <TextField
            label="صالح حتى (اختياري)"
            name="useByDeadline"
            type="datetime-local"
            hint="تقديركم لصلاحية الطعام — يُعرض للجمعية بجانب ملاحظات السلامة."
            value={values.useByDeadline}
            onChange={handleChange}
            error={fieldErrors.useByDeadline}
          />
        </div>

        <TextAreaField
          label="ملاحظات السلامة"
          name="safetyInfo"
          rows={2}
          hint="المسبّبات الحساسية، درجة الحفظ، أي تنبيه يجب أن تعرفه الجمعية."
          value={values.safetyInfo}
          onChange={handleChange}
          error={fieldErrors.safetyInfo}
        />

        <div className="form-actions">
          <button type="submit" className="btn btn--primary" disabled={submitting}>
            {submitting ? 'جارٍ الحفظ…' : isEdit ? 'حفظ التغييرات' : 'نشر العرض'}
          </button>
          <Link className="btn btn--ghost" to="/restaurant">
            إلغاء
          </Link>
        </div>

        {!isEdit && (
          <div className="quick-deadlines">
            <span className="quick-deadlines-label">مواعيد سريعة:</span>
            {[2, 6, 24].map((hours) => (
              <button
                key={hours}
                type="button"
                className="chip"
                onClick={() =>
                  setValues((prev) => ({
                    ...prev,
                    pickupDeadline: toFutureInput(hours * 60),
                  }))
                }
              >
                خلال {hours} ساعة
              </button>
            ))}
          </div>
        )}
      </form>
    </section>
  );
}

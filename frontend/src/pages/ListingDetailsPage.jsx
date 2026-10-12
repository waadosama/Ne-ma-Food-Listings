import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { browseApi, requestsApi, ApiError } from '../services/api.js';
import useAsync from '../hooks/useAsync.js';
import QuantityBar from '../components/ui/QuantityBar.jsx';
import Deadline from '../components/ui/Deadline.jsx';
import Alert from '../components/ui/Alert.jsx';
import Loading from '../components/ui/Loading.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import { TextField, TextAreaField } from '../components/ui/Field.jsx';
import {
  CATEGORY_LABELS,
  UNIT_LABELS,
  formatDateTime,
  unitLabel,
} from '../utils/format.js';

// Listing detail + the request form.
//
// Everything on this screen comes from the API: the listing from
// GET /api/browse/listings/:id, and the charity's existing requests from
// GET /api/requests. The latter is how the form knows whether this charity
// already has an open claim on this listing — a rule the backend enforces
// anyway (409 REQUEST_ALREADY_EXISTS), this simply stops the user walking
// into it.

export default function ListingDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();

  const listingQuery = useAsync(() => browseApi.details(id), [id]);
  const myRequestsQuery = useAsync(() => requestsApi.list(), [id]);

  const [quantity, setQuantity] = useState('');
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [created, setCreated] = useState(null);

  const listing = listingQuery.data?.listing;

  const existingOpen = (myRequestsQuery.data?.requests ?? []).find(
    (request) =>
      request.foodListingId === Number(id) &&
      (request.status === 'PENDING' || request.status === 'ACCEPTED')
  );

  async function handleSubmit(event) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    const parsed = Number(quantity);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setFieldErrors({ requestedQuantity: 'أدخل كمية أكبر من صفر.' });
      return;
    }

    setSubmitting(true);
    try {
      const { request } = await requestsApi.create({
        foodListingId: Number(id),
        requestedQuantity: parsed,
        ...(message.trim() ? { message: message.trim() } : {}),
      });
      setCreated(request);
      myRequestsQuery.reload();
      listingQuery.reload();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.fieldErrors());
      } else {
        setError('تعذّر إرسال الطلب. حاول مرة أخرى.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  if (listingQuery.status === 'loading') return <Loading full label="جارٍ تحميل العرض…" />;

  if (listingQuery.status === 'error') {
    const notFound = listingQuery.error?.status === 404;
    return (
      <section className="page page--centered">
        {notFound ? (
          <EmptyState
            icon="◇"
            title="هذا العرض غير موجود أو لم يعد متاحاً"
            hint="قد يكون تم استلامه بالكامل أو سحبه من النشر."
            action={
              <div className="state-actions">
                <Link className="btn btn--primary" to="/browse">عودة إلى القائمة</Link>
              </div>
            }
          />
        ) : (
          <ErrorState error={listingQuery.error} onRetry={listingQuery.reload} />
        )}
      </section>
    );
  }

  if (!listing) return null;

  const maxQuantity = Number(listing.availableQuantity);
  const expired = listing.status !== 'ACTIVE';

  return (
    <section className="page listing-detail">
      <nav className="breadcrumb" aria-label="مسار التنقل">
        <Link to="/browse">الطعام المتاح</Link>
        <span aria-hidden="true">/</span>
        <span>{listing.foodName}</span>
      </nav>

      <div className="listing-detail-grid">
        <article className="card listing-detail-main">
          <header className="listing-detail-head">
            <div>
              <span className="listing-category">
                {CATEGORY_LABELS[listing.category] ?? listing.category}
              </span>
              <h1>{listing.foodName}</h1>
            </div>
            <StatusBadge kind="listing" value={listing.status} />
          </header>

          {listing.organizationName && (
            <p className="listing-org listing-org--lg">
              <span aria-hidden="true">⌂</span>
              <span>
                <strong>{listing.organizationName}</strong>
                {listing.organizationCity ? ` · ${listing.organizationCity}` : ''}
              </span>
            </p>
          )}

          <QuantityBar
            availableQuantity={listing.availableQuantity}
            totalQuantity={listing.totalQuantity}
            unit={listing.unit}
          />

          <dl className="detail-facts">
            <div>
              <dt>آخر موعد للاستلام</dt>
              <dd><Deadline iso={listing.pickupDeadline} /></dd>
            </div>
            <div>
              <dt>موقع الاستلام</dt>
              <dd>{listing.pickupLocation}</dd>
            </div>
            <div>
              <dt>وحدة القياس</dt>
              <dd>{UNIT_LABELS[listing.unit] ?? listing.unit}</dd>
            </div>
            {listing.useByDeadline && (
              <div>
                <dt>صالح حتى (تقدير المطعّم)</dt>
                <dd>{formatDateTime(listing.useByDeadline)}</dd>
              </div>
            )}
          </dl>

          {listing.safetyInfo && (
            <div className="callout callout--warning">
              <strong>ملاحظات السلامة</strong>
              <p>{listing.safetyInfo}</p>
            </div>
          )}

          {listing.description && (
            <div className="listing-detail-description">
              <h2>عن هذا العرض</h2>
              <p>{listing.description}</p>
            </div>
          )}

          <p className="page-note">
            ما يظهر هنا كمية وموعد تسليم من المطعّم. صلاحية الطعام لا تُستنتج
            من المواعيد — تُعرض ملاحظات السلامة كما هي لتقرّر الجمعية بنفسها.
          </p>
        </article>

        <aside className="card listing-request-panel">
          <h2>اطلب هذا العرض</h2>

          {created ? (
            <>
              <Alert tone="success" title="تم إرسال طلبك">
                طلبك بكمية {unitLabel(created.unit, created.requestedQuantity)} بانتظار
                مراجعة المطعّم. ستتلقى قراره هنا.
              </Alert>
              <div className="state-actions">
                <Link className="btn btn--primary" to="/charity/requests">متابعة طلباتي</Link>
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => {
                    setCreated(null);
                    setQuantity('');
                    setMessage('');
                  }}
                >
                  إرسال طلب آخر
                </button>
              </div>
            </>
          ) : existingOpen ? (
            <>
              <Alert tone="info" title="لديك طلب مفتوح على هذا العرض">
                {existingOpen.status === 'ACCEPTED'
                  ? 'تمت الموافقة على طلبك — تابع التسليم من صفحة طلباتي.'
                  : 'طلبك قيد المراجعة لدى المطعّم. يمكنك إلغاؤه من صفحة طلباتي.'}
              </Alert>
              <div className="state-actions">
                <Link className="btn btn--primary" to="/charity/requests">متابعة الطلب</Link>
              </div>
            </>
          ) : expired ? (
            <Alert tone="error" title="لا يمكن طلب هذا العرض">
              انتهى وقت استلام هذا العرض أو لم يعد متاحاً.
            </Alert>
          ) : (
            <form className="form" onSubmit={handleSubmit} noValidate>
              {error && <Alert tone="error" title="تعذّر إرسال الطلب">{error}</Alert>}

              <TextField
                label="الكمية المطلوبة"
                name="requestedQuantity"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                max={maxQuantity}
                required
                hint={`المتاح حالياً: ${maxQuantity} ${listing.unit === 'PORTIONS' ? 'حصة' : listing.unit}.`}
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                error={fieldErrors.requestedQuantity}
              />

              <TextAreaField
                label="رسالة للمطعّم (اختياري)"
                name="message"
                rows={3}
                hint="عدد المستفيدين، وقت الاستلام المتوقع، أو أي تنبيه يفيد المطعّم."
                value={message}
                onChange={(event) => setMessage(event.target.value)}
                error={fieldErrors.message}
              />

              <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
                {submitting ? 'جارٍ الإرسال…' : 'إرسال الطلب'}
              </button>

              <p className="form-footnote">
                لا تُحجز الكمية إلا بعد موافقة المطعّم.
              </p>
            </form>
          )}

          <div className="panel-links">
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={() => navigate('/browse')}
            >
              عودة إلى القائمة
            </button>
          </div>
        </aside>
      </div>
    </section>
  );
}

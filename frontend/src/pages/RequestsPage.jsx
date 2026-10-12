import { useState } from 'react';
import { Link } from 'react-router-dom';
import { requestsApi, ApiError } from '../services/api.js';
import useAsync from '../hooks/useAsync.js';
import RequestCard from '../components/RequestCard.jsx';
import RequestTimeline from '../components/RequestTimeline.jsx';
import ConfirmCollectionAction from '../components/requests/ConfirmCollectionAction.jsx';
import ConfirmAction from '../components/ui/ConfirmAction.jsx';
import StatCard from '../components/ui/StatCard.jsx';
import Loading from '../components/ui/Loading.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import Alert from '../components/ui/Alert.jsx';
import { REQUEST_STATUS_LABELS } from '../utils/format.js';
import { formatQuantitySummary } from '../utils/stats.js';

// Request management and status tracking for a charity.
//
// Two data sources, both real: the list from GET /api/requests, and — only
// when a row is opened — GET /api/requests/:id, which carries the audit
// trail the backend wrote with each state change. That trail is what makes
// "why was this rejected?" answerable without asking anyone.

const FILTERS = ['', 'PENDING', 'ACCEPTED', 'COMPLETED', 'REJECTED', 'CANCELLED'];

export default function RequestsPage() {
  const { status, data, error, reload } = useAsync(
    () => requestsApi.list({ limit: 100 }),
    []
  );

  const [filter, setFilter] = useState('');
  const [timeline, setTimeline] = useState({}); // requestId -> { loading, events, error }
  const [notice, setNotice] = useState(null);

  async function loadTimeline(requestId) {
    setTimeline((prev) => ({ ...prev, [requestId]: { loading: true } }));
    try {
      const { request } = await requestsApi.get(requestId);
      setTimeline((prev) => ({
        ...prev,
        [requestId]: { loading: false, events: request.events ?? [] },
      }));
    } catch (err) {
      setTimeline((prev) => ({
        ...prev,
        [requestId]: { loading: false, error: err instanceof ApiError ? err.message : 'تعذّر التحميل' },
      }));
    }
  }

  function toggleTimeline(requestId) {
    const entry = timeline[requestId];
    if (entry && !entry.error) {
      setTimeline((prev) => {
        const next = { ...prev };
        delete next[requestId];
        return next;
      });
    } else {
      loadTimeline(requestId);
    }
  }

  async function handleCancel(requestId) {
    try {
      await requestsApi.cancel(requestId, 'ألغت الجمعية الطلب من لوحتها.');
      setNotice({ tone: 'info', text: 'تم إلغاء الطلب وإعادة الكمية إلى العرض إن كانت محجوزة.' });
      reload();
    } catch (err) {
      setNotice({
        tone: 'error',
        text: err instanceof ApiError ? err.message : 'تعذّر إلغاء الطلب.',
      });
      throw err; // keep ConfirmAction from closing on failure
    }
  }

  function handleCollected() {
    setNotice({ tone: 'success', text: 'تم تسجيل التبرع. شكراً لتأكيدك الاستلام.' });
    reload();
  }

  if (status === 'loading') return <Loading full label="جارٍ تحميل طلباتك…" />;
  if (status === 'error') return <ErrorState error={error} onRetry={reload} />;

  const requests = data.requests;
  const visible = filter ? requests.filter((request) => request.status === filter) : requests;

  const completed = requests.filter((request) => request.status === 'COMPLETED');
  const pending = requests.filter((request) => request.status === 'PENDING');
  const accepted = requests.filter((request) => request.status === 'ACCEPTED');

  return (
    <section className="page">
      <div className="page-intro page-intro--row">
        <div>
          <span className="eyebrow">إدارة الطلبات</span>
          <h1>طلباتي وتتبّعها</h1>
          <p className="page-lede">
            من هنا تتابع كل طلب من لحظة إرساله حتى تأكيد الاستلام، وترى سجل
            التغييرات الكامل.
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn btn--primary" to="/browse">تصفّح الطعام المتاح</Link>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard
          label="قيد المراجعة"
          value={pending.length}
          hint="بانتظار قرار المطعّم"
          tone={pending.length ? 'warning' : 'neutral'}
          icon="◔"
        />
        <StatCard
          label="مقبولة بانتظار الاستلام"
          value={accepted.length}
          hint={accepted.length ? 'راجع موعد الاستلام' : 'لا شيء معلّق'}
          tone={accepted.length ? 'info' : 'neutral'}
          icon="◷"
        />
        <StatCard
          label="تبرعات مكتملة"
          value={completed.length}
          hint={formatQuantitySummary(completed)}
          tone="success"
          icon="✓"
        />
        <StatCard
          label="إجمالي الطلبات"
          value={requests.length}
          hint="خلال كل الوقت"
          icon="≡"
        />
      </div>

      {notice && (
        <Alert tone={notice.tone} onDismiss={() => setNotice(null)}>
          {notice.text}
        </Alert>
      )}

      <div className="panel-head panel-head--filters">
        <h2>الطلبات</h2>
        <div className="filter-chips" role="group" aria-label="تصفية حسب الحالة">
          {FILTERS.map((statusValue) => {
            const count = statusValue
              ? requests.filter((request) => request.status === statusValue).length
              : requests.length;
            return (
              <button
                key={statusValue || 'all'}
                type="button"
                className={`chip${filter === statusValue ? ' chip--active' : ''}`}
                aria-pressed={filter === statusValue}
                onClick={() => setFilter(statusValue)}
              >
                {statusValue ? REQUEST_STATUS_LABELS[statusValue] : 'الكل'}
                <span className="chip-count">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon="◇"
          title={
            requests.length === 0
              ? 'لم ترسل أي طلب بعد'
              : `لا توجد طلبات بحالة ${REQUEST_STATUS_LABELS[filter] ?? filter}`
          }
          hint={
            requests.length === 0
              ? 'اختر عرضاً من قائمة الطعام المتاح وأرسل طلبك بالكمية التي تحتاجها.'
              : 'جرّب حالة أخرى من التصفية.'
          }
          action={
            <div className="state-actions">
              <Link className="btn btn--primary" to="/browse">
                {requests.length === 0 ? 'تصفّح الطعام المتاح' : 'عرض كل الطلبات'}
              </Link>
              {requests.length > 0 && (
                <button type="button" className="btn btn--ghost" onClick={() => setFilter('')}>
                  كل الحالات
                </button>
              )}
            </div>
          }
        />
      ) : (
        <div className="request-list">
          {visible.map((request) => {
            const entry = timeline[request.id];

            return (
              <RequestCard key={request.id} request={request} showListing>
                <div className="request-card-actions">
                  <ConfirmCollectionAction request={request} onConfirmed={handleCollected} />

                  {(request.status === 'PENDING' || request.status === 'ACCEPTED') && (
                    <ConfirmAction
                      label="إلغاء الطلب"
                      onConfirm={() => handleCancel(request.id)}
                    >
                      {request.status === 'ACCEPTED'
                        ? 'الطلب مقبول وكميته محجوزة. عند الإلغاء تُعاد الكمية إلى العرض.'
                        : 'إلغاء هذا الطلب؟'}
                    </ConfirmAction>
                  )}

                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => toggleTimeline(request.id)}
                    aria-expanded={Boolean(entry && entry.events)}
                  >
                    {entry?.events ? 'إخفاء السجل' : 'عرض سجل التغييرات'}
                  </button>
                </div>

                {entry?.loading && <Loading label="جارٍ تحميل السجل…" />}

                {entry?.error && (
                  <p className="field-error" role="alert">
                    {entry.error}
                  </p>
                )}

                {entry?.events && (
                  <div className="request-timeline">
                    {entry.events.length === 0 ? (
                      <p className="page-note">لا توجد تغييرات مسجّلة بعد.</p>
                    ) : (
                      <RequestTimeline events={entry.events} />
                    )}
                  </div>
                )}
              </RequestCard>
            );
          })}
        </div>
      )}
    </section>
  );
}

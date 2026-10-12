import { Link } from 'react-router-dom';
import { requestsApi, browseApi } from '../services/api.js';
import useAsync from '../hooks/useAsync.js';
import RequestCard from '../components/RequestCard.jsx';
import ConfirmCollectionAction from '../components/requests/ConfirmCollectionAction.jsx';
import StatCard from '../components/ui/StatCard.jsx';
import Loading from '../components/ui/Loading.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { formatQuantitySummary } from '../utils/stats.js';

// The charity's home base: what is waiting on them, and what they have
// already received.
//
// Donation figures are counted from GET /api/requests — a COMPLETED request
// is one whose collection was confirmed and whose donation the backend
// recorded. The availability figure comes from GET /api/browse/listings.
// Both are real responses; neither is cached across sessions.

export default function CharityDashboard() {
  const requestsQuery = useAsync(() => requestsApi.list({ limit: 100 }), []);
  const browseQuery = useAsync(() => browseApi.list({ limit: 100 }), []);

  const reload = () => {
    requestsQuery.reload();
    browseQuery.reload();
  };

  if (requestsQuery.status === 'loading') return <Loading full label="جارٍ تحميل لوحة الجمعية…" />;
  if (requestsQuery.status === 'error') {
    return <ErrorState error={requestsQuery.error} onRetry={requestsQuery.reload} />;
  }

  const requests = requestsQuery.data.requests;
  const accepted = requests.filter((request) => request.status === 'ACCEPTED');
  const pending = requests.filter((request) => request.status === 'PENDING');
  const completed = requests.filter((request) => request.status === 'COMPLETED');
  const recent = requests.slice(0, 5);

  const availableCount = browseQuery.data?.listings.length ?? 0;

  return (
    <section className="page">
      <div className="page-intro page-intro--row">
        <div>
          <span className="eyebrow">لوحة الجمعيات</span>
          <h1>طلباتك وأثرك</h1>
          <p className="page-lede">
            تابع الطلبات قيد المراجعة، أكّد استلام ما وافق عليه المطعّم، وراقب
            التبرعات المسجّلة.
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn btn--primary" to="/browse">تصفّح الطعام المتاح</Link>
          <Link className="btn btn--ghost" to="/charity/requests">إدارة الطلبات</Link>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard
          label="طعام متاح الآن"
          value={availableCount}
          hint={browseQuery.status === 'loading' ? 'جارٍ التحميل' : 'عرض جاهز للطلب'}
          tone={availableCount ? 'success' : 'neutral'}
          icon="◇"
        />
        <StatCard
          label="قيد المراجعة"
          value={pending.length}
          hint="بانتظار قرار المطعّم"
          tone={pending.length ? 'warning' : 'neutral'}
          icon="◔"
        />
        <StatCard
          label="محجوز بانتظار الاستلام"
          value={accepted.length}
          hint={accepted.length ? 'راجع موعده' : 'لا شيء معلّق'}
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
      </div>

      <section className="panel" aria-labelledby="action-title">
        <div className="panel-head">
          <h2 id="action-title">تحتاج إجراءً منك</h2>
          <span className="panel-count">{accepted.length}</span>
        </div>

        {accepted.length === 0 ? (
          <EmptyState
            icon="✓"
            title="لا يوجد ما يحتاج تأكيداً"
            hint="عند موافقة مطعم على طلبك سيظهر هنا لتأكيد الاستلام."
            action={
              <div className="state-actions">
                <Link className="btn btn--ghost" to="/charity/requests">كل طلباتي</Link>
              </div>
            }
          />
        ) : (
          <div className="request-list">
            {accepted.map((request) => (
              <RequestCard key={request.id} request={request} showListing>
                <div className="request-card-actions">
                  <ConfirmCollectionAction request={request} onConfirmed={reload} />
                  <Link className="btn btn--ghost btn--sm" to="/charity/requests">
                    التفاصيل والسجل
                  </Link>
                </div>
              </RequestCard>
            ))}
          </div>
        )}
      </section>

      <section className="panel" aria-labelledby="recent-title">
        <div className="panel-head">
          <h2 id="recent-title">أحدث الطلبات</h2>
          <span className="panel-count">{requests.length}</span>
        </div>

        {requests.length === 0 ? (
          <EmptyState
            icon="◇"
            title="لم ترسل أي طلب بعد"
            hint="ابدأ بتصفح الطعام المتاح واختر ما يناسب احتياج مستفيديك."
            action={
              <div className="state-actions">
                <Link className="btn btn--primary" to="/browse">تصفّح العروض</Link>
              </div>
            }
          />
        ) : (
          <div className="request-list">
            {recent.map((request) => (
              <RequestCard key={request.id} request={request} showListing />
            ))}
          </div>
        )}

        {requests.length > recent.length && (
          <div className="section-cta">
            <Link className="btn btn--ghost" to="/charity/requests">
              عرض كل الطلبات ({requests.length})
            </Link>
          </div>
        )}
      </section>
    </section>
  );
}

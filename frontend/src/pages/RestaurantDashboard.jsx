import { Link } from 'react-router-dom';
import { listingsApi } from '../services/api.js';
import useAsync from '../hooks/useAsync.js';
import ListingCard from '../components/ListingCard.jsx';
import RequestCard from '../components/RequestCard.jsx';
import RequestDecisionActions from '../components/requests/RequestDecisionActions.jsx';
import ListingCancelAction from '../components/listings/ListingCancelAction.jsx';
import StatCard from '../components/ui/StatCard.jsx';
import Loading from '../components/ui/Loading.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { formatQuantitySummary, countByStatus } from '../utils/stats.js';

// The restaurant's home base.
//
// One load gathers its listings and, for each, the requests against it —
// the API exposes requests per listing rather than per organization, so the
// aggregation happens here. Every figure below is a count or a sum over
// those responses; nothing is estimated.
//
// Cancelling a listing and deciding a request both reload this view, so the
// availability the dashboard shows is the same number the backend just
// wrote.

export default function RestaurantDashboard() {
  const { status, data, error, reload } = useAsync(async () => {
    const { listings } = await listingsApi.list({ limit: 100 });

    const perListing = await Promise.all(
      listings.map(async (listing) => {
        try {
          const { requests } = await listingsApi.listRequests(listing.id, { limit: 100 });
          return { listing, requests };
        } catch {
          // A listing removed between the two calls is not a reason to fail
          // the whole dashboard.
          return { listing, requests: [] };
        }
      })
    );

    return perListing;
  }, []);

  if (status === 'loading') return <Loading full label="جارٍ تحميل لوحة المطاعم…" />;
  if (status === 'error') return <ErrorState error={error} onRetry={reload} />;

  const rows = data;
  const listings = rows.map((row) => row.listing);
  const allRequests = rows.flatMap((row) =>
    row.requests.map((request) => ({
      ...request,
      listingId: row.listing.id,
      listingName: row.listing.foodName,
      listingStatus: row.listing.status,
    }))
  );

  const pending = allRequests.filter((request) => request.status === 'PENDING');
  const accepted = allRequests.filter((request) => request.status === 'ACCEPTED');
  const completed = allRequests.filter((request) => request.status === 'COMPLETED');
  const activeListings = listings.filter((listing) => listing.status === 'ACTIVE');

  return (
    <section className="page">
      <div className="page-intro page-intro--row">
        <div>
          <span className="eyebrow">لوحة المطاعم والمخابز</span>
          <h1>عروضك والطلبات الواردة</h1>
          <p className="page-lede">
            انشر فائضك، راجع كل طلب، وتابع الكميات المحجوزة حتى التسليم.
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn btn--primary" to="/restaurant/listings/new">
            + عرض جديد
          </Link>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard
          label="عروض نشطة"
          value={activeListings.length}
          hint={`من ${listings.length} عرض`}
          tone="success"
          icon="◔"
        />
        <StatCard
          label="بانتظار قرارك"
          value={pending.length}
          hint={pending.length ? 'تحتاج مراجعة' : 'لا شيء معلّق'}
          tone={pending.length ? 'warning' : 'neutral'}
          icon="!"
        />
        <StatCard
          label="محجوزة قيد التسليم"
          value={accepted.length}
          hint="موافَق عليها ولم تُستلم بعد"
          tone="info"
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

      {pending.length > 0 && (
        <section className="panel" aria-labelledby="pending-title">
          <div className="panel-head">
            <h2 id="pending-title">طلبات بانتظار القرار</h2>
            <span className="panel-count">{pending.length}</span>
          </div>
          <div className="request-list">
            {pending.map((request) => (
              <RequestCard
                key={`${request.listingId}-${request.id}`}
                request={request}
                showCharity
                actions={
                  <RequestDecisionActions
                    listingId={request.listingId}
                    request={request}
                    onDecided={reload}
                  />
                }
              >
                <p className="request-context">
                  العرض: <Link to={`/restaurant/listings/${request.listingId}/requests`}>{request.listingName}</Link>
                </p>
              </RequestCard>
            ))}
          </div>
        </section>
      )}

      <section className="panel" aria-labelledby="listings-title">
        <div className="panel-head">
          <h2 id="listings-title">عروضك</h2>
          <span className="panel-count">{listings.length}</span>
        </div>

        {listings.length === 0 ? (
          <EmptyState
            icon="◇"
            title="لم تنشر أي عرض بعد"
            hint="أول عرض تنشره يظهر فوراً للجمعيات المعتمدة، وتبدأ الطلبات بالوصول هنا."
            action={
              <div className="state-actions">
                <Link className="btn btn--primary" to="/restaurant/listings/new">
                  إنشاء أول عرض
                </Link>
              </div>
            }
          />
        ) : (
          <div className="listing-grid">
            {listings.map((listing) => {
              const forListing = allRequests.filter((r) => r.listingId === listing.id);
              const pendingCount = countByStatus(forListing, 'PENDING');

              return (
                <ListingCard
                  key={listing.id}
                  listing={listing}
                  to={`/restaurant/listings/${listing.id}/requests`}
                  footer={
                    <p className="listing-card-meta">
                      {forListing.length === 0
                        ? 'لا توجد طلبات بعد'
                        : `${forListing.length} طلب · ${pendingCount} بانتظار قرارك`}
                    </p>
                  }
                  actions={
                    <>
                      <Link
                        className="btn btn--primary btn--sm"
                        to={`/restaurant/listings/${listing.id}/requests`}
                      >
                        مراجعة الطلبات
                        {pendingCount > 0 && <span className="count-dot">{pendingCount}</span>}
                      </Link>
                      <Link
                        className="btn btn--ghost btn--sm"
                        to={`/restaurant/listings/${listing.id}/edit`}
                      >
                        تعديل
                      </Link>
                      <ListingCancelAction listing={listing} onCancelled={reload} />
                    </>
                  }
                />
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}

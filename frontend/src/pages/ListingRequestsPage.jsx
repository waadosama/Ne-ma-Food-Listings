import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { listingsApi } from '../services/api.js';
import useAsync from '../hooks/useAsync.js';
import RequestCard from '../components/RequestCard.jsx';
import RequestDecisionActions from '../components/requests/RequestDecisionActions.jsx';
import ListingCancelAction from '../components/listings/ListingCancelAction.jsx';
import QuantityBar from '../components/ui/QuantityBar.jsx';
import Deadline from '../components/ui/Deadline.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import Loading from '../components/ui/Loading.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { REQUEST_STATUS_LABELS } from '../utils/format.js';

// The restaurant's inbox for a single batch of food.
//
// Approval and rejection happen here. Both go through
// PATCH /food-listings/:id/requests/:requestId, and the backend scopes the
// row lock by organization — a listing id this organization does not own is
// a 404, so there is no way to answer someone else's request even by
// editing the URL.

const FILTERS = ['', 'PENDING', 'ACCEPTED', 'REJECTED', 'CANCELLED', 'COMPLETED'];

export default function ListingRequestsPage() {
  const { id } = useParams();
  const [filter, setFilter] = useState('');

  const listingQuery = useAsync(() => listingsApi.get(id), [id]);
  const requestsQuery = useAsync(() => listingsApi.listRequests(id, { limit: 100 }), [id]);

  const reload = () => {
    listingQuery.reload();
    requestsQuery.reload();
  };

  if (listingQuery.status === 'loading') return <Loading full label="جارٍ تحميل العرض…" />;
  if (listingQuery.status === 'error') {
    return (
      <section className="page page--centered">
        <ErrorState
          error={listingQuery.error}
          title={listingQuery.error?.status === 404 ? 'هذا العرض غير موجود أو ليس من نشرك' : undefined}
          onRetry={listingQuery.reload}
        />
        <div className="page-actions">
          <Link className="btn btn--ghost" to="/restaurant">العودة إلى لوحتي</Link>
        </div>
      </section>
    );
  }

  const listing = listingQuery.data.listing;
  const requests = requestsQuery.data?.requests ?? [];
  const visible = filter ? requests.filter((request) => request.status === filter) : requests;

  return (
    <section className="page">
      <nav className="breadcrumb" aria-label="مسار التنقل">
        <Link to="/restaurant">لوحتي</Link>
        <span aria-hidden="true">/</span>
        <span>{listing.foodName}</span>
      </nav>

      <div className="page-intro page-intro--row">
        <div>
          <span className="eyebrow">صندوق الطلبات</span>
          <h1>{listing.foodName}</h1>
          <p className="page-lede">
            {listing.organizationName && <span>{listing.organizationName} · </span>}
            {listing.pickupLocation}
          </p>
        </div>
        <div className="page-actions">
          <Link className="btn btn--ghost" to={`/restaurant/listings/${id}/edit`}>
            تعديل العرض
          </Link>
          <ListingCancelAction listing={listing} onCancelled={reload} />
        </div>
      </div>

      <div className="card listing-summary">
        <div className="listing-summary-main">
          <StatusBadge kind="listing" value={listing.status} />
          <QuantityBar
            availableQuantity={listing.availableQuantity}
            totalQuantity={listing.totalQuantity}
            unit={listing.unit}
          />
        </div>
        <dl className="detail-facts detail-facts--inline">
          <div>
            <dt>آخر موعد للاستلام</dt>
            <dd><Deadline iso={listing.pickupDeadline} /></dd>
          </div>
          <div>
            <dt>موقع الاستلام</dt>
            <dd>{listing.pickupLocation}</dd>
          </div>
        </dl>
      </div>

      <div className="panel-head panel-head--filters">
        <h2>الطلبات</h2>
        <div className="filter-chips" role="group" aria-label="تصفية حسب الحالة">
          {FILTERS.map((status) => {
            const count = status
              ? requests.filter((request) => request.status === status).length
              : requests.length;

            return (
              <button
                key={status || 'all'}
                type="button"
                className={`chip${filter === status ? ' chip--active' : ''}`}
                aria-pressed={filter === status}
                onClick={() => setFilter(status)}
              >
                {status ? REQUEST_STATUS_LABELS[status] : 'الكل'}
                <span className="chip-count">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {requestsQuery.status === 'loading' && <Loading label="جارٍ تحميل الطلبات…" />}
      {requestsQuery.status === 'error' && (
        <ErrorState error={requestsQuery.error} onRetry={requestsQuery.reload} />
      )}

      {requestsQuery.status === 'ok' && visible.length === 0 && (
        <EmptyState
          icon="◇"
          title={
            requests.length === 0
              ? 'لا توجد طلبات على هذا العرض بعد'
              : `لا توجد طلبات بحالة ${REQUEST_STATUS_LABELS[filter] ?? filter}`
          }
          hint={
            requests.length === 0
              ? 'ستظهر الطلبات هنا فور إرسالها من الجمعيات المعتمدة.'
              : 'جرّب حالة أخرى من التصفية.'
          }
          action={
            requests.length > 0 ? (
              <div className="state-actions">
                <button type="button" className="btn btn--ghost" onClick={() => setFilter('')}>
                  عرض الكل
                </button>
              </div>
            ) : undefined
          }
        />
      )}

      {requestsQuery.status === 'ok' && visible.length > 0 && (
        <div className="request-list">
          {visible.map((request) => (
            <RequestCard key={request.id} request={request} showCharity>
              <RequestDecisionActions
                listingId={Number(id)}
                request={request}
                onDecided={reload}
              />
            </RequestCard>
          ))}
        </div>
      )}
    </section>
  );
}

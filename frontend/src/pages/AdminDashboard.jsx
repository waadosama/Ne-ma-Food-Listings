import { useMemo, useState } from 'react';
import { organizationsApi } from '../services/api.js';
import useAsync from '../hooks/useAsync.js';
import VerificationActions from '../components/organizations/VerificationActions.jsx';
import StatusBadge from '../components/StatusBadge.jsx';
import StatCard from '../components/ui/StatCard.jsx';
import Loading from '../components/ui/Loading.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { ORG_TYPE_LABELS, VERIFICATION_LABELS, formatDate } from '../utils/format.js';

// The administrator's verification queue.
//
// One call to GET /api/organizations returns every organization for an
// admin, so the status counts below are derived from the same response the
// list renders — the numbers can never disagree with the rows. The actual
// decision goes to PATCH /organizations/:id/verify, which is admin-only on
// the server regardless of what this screen shows.

const FILTERS = ['', 'PENDING', 'VERIFIED', 'REJECTED'];

export default function AdminDashboard() {
  const { status, data, error, reload } = useAsync(
    () => organizationsApi.list({ limit: 100 }),
    []
  );

  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');

  const organizations = data?.organizations ?? [];

  const counts = useMemo(
    () => ({
      PENDING: organizations.filter((org) => org.verificationStatus === 'PENDING').length,
      VERIFIED: organizations.filter((org) => org.verificationStatus === 'VERIFIED').length,
      REJECTED: organizations.filter((org) => org.verificationStatus === 'REJECTED').length,
    }),
    [organizations]
  );

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return organizations.filter((org) => {
      const matchesStatus = filter ? org.verificationStatus === filter : true;
      const matchesTerm = term
        ? org.name.toLowerCase().includes(term) ||
          org.city.toLowerCase().includes(term) ||
          ORG_TYPE_LABELS[org.type]?.includes(term)
        : true;
      return matchesStatus && matchesTerm;
    });
  }, [organizations, filter, search]);

  if (status === 'loading') return <Loading full label="جارٍ تحميل قائمة المنظمات…" />;
  if (status === 'error') return <ErrorState error={error} onRetry={reload} />;

  return (
    <section className="page">
      <div className="page-intro page-intro--row">
        <div>
          <span className="eyebrow">إدارة المنصة</span>
          <h1>اعتماد المنظمات</h1>
          <p className="page-lede">
            لا يشارك في عمليات التبرع إلا منظّم اعتمده مسؤول المنصّة. راجع
            البيانات ثم اتخذ القرار.
          </p>
        </div>
        <div className="page-filters">
          <label className="sr-only" htmlFor="org-search">بحث بالاسم أو المدينة</label>
          <input
            id="org-search"
            className="input"
            type="search"
            placeholder="ابحث بالاسم أو المدينة…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      </div>

      <div className="stats-grid">
        <StatCard
          label="بانتظار الاعتماد"
          value={counts.PENDING}
          hint={counts.PENDING ? 'تحتاج مراجعة' : 'القائمة فارغة'}
          tone={counts.PENDING ? 'warning' : 'neutral'}
          icon="!"
        />
        <StatCard label="منظمات معتمدة" value={counts.VERIFIED} tone="success" icon="✓" />
        <StatCard label="مرفوضة" value={counts.REJECTED} tone="danger" icon="×" />
        <StatCard label="إجمالي المنظمات" value={organizations.length} icon="≡" />
      </div>

      <div className="panel-head panel-head--filters">
        <h2>المنظمات</h2>
        <div className="filter-chips" role="group" aria-label="تصفية حسب حالة الاعتماد">
          {FILTERS.map((statusValue) => {
            const count = statusValue ? counts[statusValue] : organizations.length;
            return (
              <button
                key={statusValue || 'all'}
                type="button"
                className={`chip${filter === statusValue ? ' chip--active' : ''}`}
                aria-pressed={filter === statusValue}
                onClick={() => setFilter(statusValue)}
              >
                {statusValue ? VERIFICATION_LABELS[statusValue] : 'الكل'}
                <span className="chip-count">{count}</span>
              </button>
            );
          })}
        </div>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon="◇"
          title={search || filter ? 'لا نتائج مطابقة' : 'لا توجد منظمات بعد'}
          hint={
            search || filter
              ? 'غيّر كلمة البحث أو أعد التصفية.'
              : 'ستظهر هنا المنظمات فور تسجيلها عبر المنصة.'
          }
          action={
            search || filter ? (
              <div className="state-actions">
                <button
                  type="button"
                  className="btn btn--ghost"
                  onClick={() => { setSearch(''); setFilter(''); }}
                >
                  مسح التصفية
                </button>
              </div>
            ) : undefined
          }
        />
      ) : (
        <div className="org-list">
          {visible.map((org) => (
            <article className="card org-card" key={org.id}>
              <header className="org-card-head">
                <div>
                  <span className="org-type">{ORG_TYPE_LABELS[org.type] ?? org.type}</span>
                  <h3>{org.name}</h3>
                  <p className="org-place">
                    <span aria-hidden="true">⌖</span> {org.city}
                    {org.region ? ` · ${org.region}` : ''}
                  </p>
                </div>
                <StatusBadge kind="verification" value={org.verificationStatus} />
              </header>

              {org.description && <p className="org-description">{org.description}</p>}

              <dl className="org-facts">
                <div>
                  <dt>العنوان</dt>
                  <dd>{org.addressLine}</dd>
                </div>
                <div>
                  <dt>بريد التواصل</dt>
                  <dd dir="ltr">{org.contactEmail}</dd>
                </div>
                {org.contactPhone && (
                  <div>
                    <dt>هاتف التواصل</dt>
                    <dd dir="ltr">{org.contactPhone}</dd>
                  </div>
                )}
                <div>
                  <dt>تاريخ التسجيل</dt>
                  <dd>{formatDate(org.createdAt)}</dd>
                </div>
                {org.verifiedAt && (
                  <div>
                    <dt>تاريخ الاعتماد</dt>
                    <dd>{formatDate(org.verifiedAt)}</dd>
                  </div>
                )}
              </dl>

              <footer className="org-card-actions">
                <VerificationActions organization={org} onDecided={reload} />
              </footer>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

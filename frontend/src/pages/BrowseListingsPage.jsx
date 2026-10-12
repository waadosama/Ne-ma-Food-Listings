import { useState } from 'react';
import { Link } from 'react-router-dom';
import { browseApi } from '../services/api.js';
import useAsync from '../hooks/useAsync.js';
import ListingCard from '../components/ListingCard.jsx';
import Loading from '../components/ui/Loading.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { SelectField } from '../components/ui/Field.jsx';
import { CATEGORY_LABELS } from '../utils/format.js';

// The charity's marketplace: everything currently on offer, straight from
// GET /api/browse/listings. The backend already excludes cancelled,
// exhausted, expired and unverified listings, so this screen only ever
// renders food that can genuinely be asked for.

const CATEGORY_OPTIONS = [
  { value: '', label: 'كل الفئات' },
  ...Object.entries(CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
];

export default function BrowseListingsPage() {
  const [category, setCategory] = useState('');

  const { status, data, error, reload } = useAsync(
    () => browseApi.list({ category: category || undefined }),
    [category]
  );

  return (
    <section className="page">
      <div className="page-intro page-intro--row">
        <div>
          <span className="eyebrow">المتاح للجمعيات المعتمدة</span>
          <h1>الطعام المتاح</h1>
          <p className="page-lede">
            كميات فعلية منشورة من مطاعم ومعارف معتمدة. اختر ما يناسب احتياجك
            واطلبه بالكمية المطلوبة.
          </p>
        </div>

        <div className="page-filters">
          <SelectField
            label="الفئة"
            name="category"
            options={CATEGORY_OPTIONS}
            value={category}
            onChange={(event) => setCategory(event.target.value)}
          />
        </div>
      </div>

      {status === 'loading' && <Loading label="جارٍ تحميل العروض…" />}

      {status === 'error' && <ErrorState error={error} onRetry={reload} />}

      {status === 'ok' && data.listings.length === 0 && (
        <EmptyState
          icon="◇"
          title={category ? 'لا توجد عروض في هذه الفئة' : 'لا توجد عروض متاحة حالياً'}
          hint={
            category
              ? 'جرّب فئة أخرى أو أعد التصفية لاحقاً.'
              : 'ستظهر هنا العروض فور نشرها من المطاعم والمخابز المعتمدة.'
          }
          action={
            category ? (
              <div className="state-actions">
                <button type="button" className="btn btn--ghost" onClick={() => setCategory('')}>
                  عرض كل الفئات
                </button>
              </div>
            ) : (
              <div className="state-actions">
                <Link className="btn btn--primary" to="/charity">العودة إلى لوحتي</Link>
              </div>
            )
          }
        />
      )}

      {status === 'ok' && data.listings.length > 0 && (
        <>
          <p className="result-count">
            {data.listings.length} عرض متاح
          </p>
          <div className="listing-grid">
            {data.listings.map((listing) => (
              <ListingCard
                key={listing.id}
                listing={listing}
                showOrganization
                to={`/browse/${listing.id}`}
              />
            ))}
          </div>
        </>
      )}
    </section>
  );
}

import { Link } from 'react-router-dom';
import HealthStatus from '../components/HealthStatus.jsx';
import ListingCard from '../components/ListingCard.jsx';
import Loading from '../components/ui/Loading.jsx';
import ErrorState from '../components/ui/ErrorState.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { browseApi, ApiError } from '../services/api.js';
import useAsync from '../hooks/useAsync.js';

// The public face of the platform: mission first, then a live look at what
// is actually on offer.
//
// The preview is real data from `GET /api/browse/listings`. That endpoint
// belongs to verified charities, so for anyone else the section honestly
// says so and offers the sign-in path instead of showing a hand-built list
// of food that may not exist. There is no mocked inventory anywhere in this
// component.

const foodTypes = [
  {
    image: '/images/meal.jpg',
    alt: 'وجبة طازجة متكاملة',
    category: 'وجبات طازجة',
    description: 'وجبات أُعدّت بعناية ويمكن مشاركتها في وقتها.',
  },
  {
    image: '/images/bread.jpg',
    alt: 'مخبوزات طازجة',
    category: 'مخبوزات اليوم',
    description: 'خبز ومخبوزات فائضة تستحق أن تصل إلى مائدة جديدة.',
  },
  {
    image: '/images/community-food-donation.jpg',
    alt: 'متطوعون يجهزون الطعام للتوزيع',
    category: 'مبادرات التوزيع',
    description: 'جمعيات ومتطوعون يحوّلون التبرعات إلى دعم حقيقي.',
  },
];

function AvailableNow() {
  const { role, isVerified, isAuthenticated } = useAuth();
  const canBrowse = role === 'CHARITY' && isVerified;

  const { status, data, error, reload } = useAsync(
    async () => (canBrowse ? browseApi.list({ limit: 3 }) : null),
    [canBrowse]
  );

  const blocked =
    error instanceof ApiError && (error.status === 401 || error.status === 403);

  let body;

  if (status === 'loading') {
    body = <Loading label="جارٍ جلب العروض المتاحة…" />;
  } else if (blocked) {
    body = (
      <EmptyState
        icon="🔒"
        title="لعرض الطعام المتاح سجّل دخولك كجمعية معتمدة"
        hint="تُعرض هذه القائمة للجمعيات المعتمدة فقط، لأنها تعكس كميات حقيقية محجوزة قيد التسليم."
        action={
          <div className="state-actions">
            <Link className="btn btn--primary" to="/login">دخول</Link>
            <Link className="btn btn--ghost" to="/register">إنشاء حساب جمعية</Link>
          </div>
        }
      />
    );
  } else if (status === 'error') {
    body = <ErrorState error={error} title="تعذّر جلب العروض" onRetry={reload} />;
  } else if (!data) {
    body = (
      <EmptyState
        icon="🍽"
        title={
          isAuthenticated && role === 'RESTAURANT'
            ? 'انشر فائضك ليراه المجتمع'
            : 'سجّل دخولك لعرض الطعام المتاح الآن'
        }
        hint={
          role === 'RESTAURANT'
            ? 'العروض التي تنشرها تظهر فوراً للجمعيات المعتمدة في منطقتها.'
            : 'القائمة المباشرة متاحة للجمعيات المعتمدة.'
        }
        action={
          <div className="state-actions">
            {role === 'RESTAURANT' ? (
              <Link className="btn btn--primary" to="/restaurant/listings/new">نشر عرض جديد</Link>
            ) : (
              <Link className="btn btn--primary" to="/login">دخول</Link>
            )}
          </div>
        }
      />
    );
  } else if (data.listings.length === 0) {
    body = (
      <EmptyState
        icon="◇"
        title="لا توجد عروض متاحة حالياً"
        hint="تعود القائمة تلقائياً فور نشر مطاعم ومنaklıف الفائض عروضاً جديدة."
        action={
          <div className="state-actions">
            <Link className="btn btn--ghost" to="/browse">كل العروض</Link>
          </div>
        }
      />
    );
  } else {
    body = (
      <>
        <div className="listing-grid">
          {data.listings.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              showOrganization
              to={canBrowse ? `/browse/${listing.id}` : '/login'}
            />
          ))}
        </div>
        <div className="section-cta">
          <Link className="btn btn--primary" to={canBrowse ? '/browse' : '/login'}>
            تصفّح كل العروض
          </Link>
        </div>
      </>
    );
  }

  return (
    <section className="food-section available-section" id="available-now" aria-labelledby="available-title">
      <div className="section-heading">
        <div>
          <span className="eyebrow eyebrow-dark">مباشر من المنصة</span>
          <h2 id="available-title">طعام متاح الآن.</h2>
        </div>
        <p>
          كميات حقيقية منشورة من مطاعم ومناكف معتمدة، مع مواعيد استلام دقيقة.
        </p>
      </div>

      <div className="preview-panel">{body}</div>
    </section>
  );
}

function HomePage() {
  return (
    <div className="home-page">
      <section className="hero" aria-labelledby="hero-title">
        <div className="hero-brand" aria-label="نِعمة">نِعمة</div>
        <div className="hero-copy">
          <span className="eyebrow">من فائض الطعام إلى فرصة جديدة</span>
          <h1 id="hero-title">
            الخير يبدأ
            <br />
            <span className="hero-title-accent">من مائدتك.</span>
          </h1>
          <p className="tagline">فائض النهار، رزق لغيرك</p>
          <p className="intro">
            نِعمة مبادرة تعمل على ربط المطاعم والمخابز بالجمعيات الخيرية،
            ليجد الطعام الفائض طريقًا إلى من يحتاجه بدلًا من أن يُهدر.
          </p>
          <div className="hero-actions">
            <a href="#available-now" className="button button-light">شاهد الفائض المتاح</a>
            <Link to="/register" className="hero-text-link">انضم إلى نِعمة <span aria-hidden="true">←</span></Link>
          </div>
        </div>

        <figure className="hero-visual">
          <img
            src="/images/community-food-donation.jpg"
            alt="متطوعون يتعاونون على تجهيز صناديق الطعام للتوزيع"
            fetchPriority="high"
          />
          <figcaption>كل مشاركة تصنع فرقًا.</figcaption>
        </figure>
      </section>

      <section className="audience-strip" aria-label="المشاركون في نِعمة">
        <span>للمطاعم والمخابز</span>
        <span className="strip-divider" aria-hidden="true" />
        <span>للجمعيات الخيرية</span>
        <span className="strip-divider" aria-hidden="true" />
        <span>لأجل مجتمع أقل هدرًا</span>
      </section>

      <AvailableNow />

      <section className="food-section" id="food-options">
        <div className="section-heading">
          <div>
            <span className="eyebrow eyebrow-dark">النعمة بأشكالها</span>
            <h2>طعام جيد، يصل لمن يقدّره.</h2>
          </div>
          <p>
            نعمل على تسهيل مشاركة مختلف أنواع الطعام الفائض عبر شبكة من
            الجمعيات والجهات المجتمعية.
          </p>
        </div>

        <div className="food-grid">
          {foodTypes.map((item) => (
            <article className="food-card" key={item.category}>
              <img src={item.image} alt={item.alt} loading="lazy" />
              <div className="food-card-copy">
                <h3>{item.category}</h3>
                <p>{item.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="process-section" id="how-it-works">
        <div className="process-intro">
          <span className="eyebrow">بخطوات واضحة</span>
          <h2>من فائض اليوم،<br />إلى أثر يدوم.</h2>
          <p>
            تنسيق بسيط بين من لديه فائض ومن يستطيع إيصاله للمستفيدين.
            هذه هي بداية طريق أكثر استدامة.
          </p>
        </div>
        <div className="process-list">
          <article className="process-step">
            <span className="step-number">01</span>
            <div>
              <h3>يُعرض الطعام الفائض</h3>
              <p>تبدأ المشاركة بتحديد نوع الطعام وكميته والوقت المناسب للاستلام.</p>
            </div>
          </article>
          <article className="process-step">
            <span className="step-number">02</span>
            <div>
              <h3>توافق الجمعية على الطلب</h3>
              <p>يراجع المطعّم الطلب، فتُحجز الكمية فوراً ويُحدَّث المتاح على العرض.</p>
            </div>
          </article>
          <article className="process-step">
            <span className="step-number">03</span>
            <div>
              <h3>تصل النعمة لمستحقيها</h3>
              <p>تؤكد الجمعية استلامها، فيُقيَّد التبرع وتُحتسب أرقام الأثر.</p>
            </div>
          </article>
        </div>
      </section>

      <section className="faq-section" aria-labelledby="faq-title">
        <div className="faq-heading">
          <span className="eyebrow eyebrow-dark">أسئلة شائعة</span>
          <h2 id="faq-title">بداية سهلة، وأثر كبير.</h2>
        </div>
        <div className="faq-list">
          <details>
            <summary>من يمكنه المساهمة بالطعام؟</summary>
            <p>المطاعم والمخابز ومقدمو الطعام الذين لديهم فائض صالح للتوزيع، بعد اعتماد المنصّة لمنظمهم.</p>
          </details>
          <details>
            <summary>من يستلم الطعام المتبرع به؟</summary>
            <p>الجمعيات والجهات الخيرية المعتمدة، وتُسجَّل عملية الاستلام عبر المنصة.</p>
          </details>
          <details>
            <summary>ما الهدف من نِعمة؟</summary>
            <p>الحد من هدر الطعام وتسهيل وصول الفائض إلى أفراد المجتمع المحتاجين.</p>
          </details>
        </div>
      </section>

      <div className="health-status" dir="ltr">
        <HealthStatus />
      </div>
    </div>
  );
}

export default HomePage;

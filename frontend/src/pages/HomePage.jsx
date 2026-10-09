import { Link } from 'react-router-dom';
import HealthStatus from '../components/HealthStatus.jsx';

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
            <a href="#food-options" className="button button-light">اكتشف الفكرة</a>
            <Link to="/about" className="hero-text-link">تعرّف على نِعمة <span aria-hidden="true">←</span></Link>
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
              <h3>تنسّق الجمعية الاستلام</h3>
              <p>تختار الجمعية ما يناسب احتياجات المستفيدين ووقت التوزيع.</p>
            </div>
          </article>
          <article className="process-step">
            <span className="step-number">03</span>
            <div>
              <h3>تصل النعمة لمستحقيها</h3>
              <p>يُوزّع الطعام في الوقت المناسب وبطريقة تحفظ قيمته.</p>
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
            <p>المطاعم والمخابز ومقدمو الطعام الذين لديهم فائض صالح للتوزيع.</p>
          </details>
          <details>
            <summary>من يستلم الطعام المتبرع به؟</summary>
            <p>الجمعيات والجهات الخيرية المشاركة، لتنسيق استلامه وتوزيعه.</p>
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

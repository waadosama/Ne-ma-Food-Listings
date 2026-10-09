function AboutPage() {
  return (
    <section className="page page-about">
      <div className="page-intro">
        <span className="eyebrow">مهمة نبنيها معًا</span>
        <h1>عن المنصة</h1>
      </div>

      <p>
        نِعمة مبادرة تهدف إلى إنقاذ الطعام الزائد من الهدر وتوزيعه على من
        يحتاجه، مع دعم تجمعات المجتمع والجهات الخيرية في إطار أكثر كفاءة
        وشفافية.
      </p>

      <div className="info-grid">
        <article className="info-card">
          <h3>الهدف</h3>
          <p>
            تقليل الهدر الغذائي وتعزيز الاستهلاك المسؤول من خلال ربط مصادر
            الفائض بالمستفيدين مباشرة.
          </p>
        </article>

        <article className="info-card">
          <h3>التأثير</h3>
          <p>
            تحسين توزيع الطعام بشكل أسرع وأكثر تنظيمًا، مع دعم المجتمعات
            التي تحتاج إلى المساعدة بشكل مستمر.
          </p>
        </article>

        <article className="info-card">
          <h3>المرحلة الحالية</h3>
          <p>
            هذه المرحلة الأولى من المشروع تركز على البنية الأساسية وتأكيد
            اتصال الواجهة بالخادم، مع جاهزية للتوسعة لاحقًا.
          </p>
        </article>
      </div>
    </section>
  );
}

export default AboutPage;

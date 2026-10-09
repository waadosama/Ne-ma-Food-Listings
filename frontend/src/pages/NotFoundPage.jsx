import { Link } from 'react-router-dom';

function NotFoundPage() {
  return (
    <section className="page">
      <h1>404</h1>
      <p>الصفحة غير موجودة.</p>
      <Link to="/">العودة إلى الرئيسية</Link>
    </section>
  );
}

export default NotFoundPage;

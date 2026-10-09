import { Outlet, Link } from 'react-router-dom';

function MainLayout() {
  return (
    <div className="layout">
      <header className="header">
        <div className="header-inner">
          <Link to="/" className="brand" aria-label="الصفحة الرئيسية">
            <span className="brand-mark" aria-hidden="true">ن</span>
            <span className="brand-text">
              <span className="brand-name">نِعمة</span>
            </span>
          </Link>

          <nav className="nav" aria-label="التنقل الرئيسي">
            <Link to="/">الرئيسية</Link>
            <a href="/#food-options">أنواع الطعام</a>
            <a href="/#how-it-works">كيف تعمل</a>
            <Link to="/about">عن نِعمة</Link>
          </nav>

          <Link to="/about" className="nav-button">عن المبادرة</Link>
        </div>
      </header>

      <main className="main">
        <Outlet />
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <Link to="/" className="footer-brand">نِعمة</Link>
          <p>فائض النهار، رزق لغيرك</p>
          <nav aria-label="روابط التذييل">
            <Link to="/">الرئيسية</Link>
            <Link to="/about">عن المنصة</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export default MainLayout;

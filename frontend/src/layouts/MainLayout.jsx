import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Badge from '../components/ui/Badge.jsx';

// The public shell: marketing pages, about, and the two auth screens.
// Authenticated work happens under AppLayout instead, so the navigation a
// visitor sees never implies there is a dashboard behind a link they cannot
// open.
//
// The nav is still aware of the session: a signed-in user is offered their
// dashboard rather than a login button, which is navigation convenience
// only — the route itself decides what they may open.

function MainLayout() {
  const { user, homePath, logout, organization } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  function handleLogout() {
    logout();
    setMenuOpen(false);
    navigate('/');
  }

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="layout">
      <header className="header">
        <div className="header-inner">
          <Link to="/" className="brand" aria-label="نِعمة — الصفحة الرئيسية" onClick={closeMenu}>
            <span className="brand-mark" aria-hidden="true">ن</span>
            <span className="brand-text">
              <span className="brand-name">نِعمة</span>
              <span className="brand-latin">Ne'ma</span>
            </span>
          </Link>

          <button
            type="button"
            className="nav-toggle"
            aria-expanded={menuOpen}
            aria-controls="primary-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span aria-hidden="true">{menuOpen ? '×' : '☰'}</span>
            <span className="sr-only">القائمة</span>
          </button>

          <nav
            id="primary-nav"
            className={`nav${menuOpen ? ' nav--open' : ''}`}
            aria-label="التنقل الرئيسي"
          >
            <NavLink to="/" end onClick={closeMenu}>الرئيسية</NavLink>
            <a href="/#food-options" onClick={closeMenu}>الطعام المتاح</a>
            <a href="/#how-it-works" onClick={closeMenu}>كيف تعمل</a>
            <NavLink to="/about" onClick={closeMenu}>عن نِعمة</NavLink>
          </nav>

          <div className="header-actions">
            {user ? (
              <>
                <Link to={homePath} className="nav-button" onClick={closeMenu}>
                  لوحتي
                </Link>
                <button type="button" className="nav-link-button" onClick={handleLogout}>
                  خروج
                </button>
              </>
            ) : (
              <>
                <Link to="/login" className="nav-link-button" onClick={closeMenu}>
                  دخول
                </Link>
                <Link to="/register" className="nav-button" onClick={closeMenu}>
                  إنشاء حساب
                </Link>
              </>
            )}
          </div>
        </div>

        {user && (
          <div className="header-session">
            <span className="header-session-name">
              مرحباً، {user.firstName}
              {organization && <span className="header-session-org"> · {organization.name}</span>}
            </span>
            {organization && <Badge tone={organization.verificationStatus === 'VERIFIED' ? 'success' : 'warning'}>
              {organization.verificationStatus === 'VERIFIED' ? 'معتمد' : 'بانتظار الاعتماد'}
            </Badge>}
          </div>
        )}
      </header>

      <main className="main">
        <Outlet />
      </main>

      <footer className="footer">
        <div className="footer-inner">
          <Link to="/" className="footer-brand">نِعمة</Link>
          <p className="footer-tagline">فائض النهار، رزق لغيرك</p>
          <nav aria-label="روابط التذييل">
            <Link to="/">الرئيسية</Link>
            <Link to="/about">عن نِعمة</Link>
            <Link to="/register">إنشاء حساب</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

export default MainLayout;

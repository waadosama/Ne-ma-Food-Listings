import { useState } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Badge from '../components/ui/Badge.jsx';
import Loading from '../components/ui/Loading.jsx';
import { ROLE_LABELS, VERIFICATION_LABELS } from '../utils/format.js';

// The authenticated shell. Navigation is role-specific: each role sees the
// screens it can actually use, and nothing else.
//
// This is wayfinding, not authorization. Every route rendered underneath is
// wrapped in ProtectedRoute for a friendly first check, and — the part that
// matters — every endpoint it calls re-verifies the token, the role and the
// organization on the server.

const NAV_BY_ROLE = {
  CHARITY: [
    { to: '/charity', label: 'لوحتي', end: true },
    { to: '/browse', label: 'الطعام المتاح' },
    { to: '/charity/requests', label: 'طلباتي وتتبّعي' },
  ],
  RESTAURANT: [
    { to: '/restaurant', label: 'لوحتي', end: true },
    { to: '/restaurant/listings/new', label: 'عرض جديد' },
  ],
  ADMIN: [{ to: '/admin', label: 'اعتماد الجمعيات', end: true }],
};

function AppLayout() {
  const { user, role, organization, isVerified, homePath, logout, status } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = useNavigate();

  if (status === 'loading') return <Loading full label="جارٍ تحميل لوحة التحكم…" />;

  const items = NAV_BY_ROLE[role] ?? [];

  function handleLogout() {
    logout();
    navigate('/');
  }

  const closeMenu = () => setMenuOpen(false);

  return (
    <div className="layout layout--app">
      <header className="header header--app">
        <div className="header-inner">
          <Link to={homePath} className="brand" aria-label="نِعمة — لوحتي" onClick={closeMenu}>
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
            aria-controls="app-nav"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <span aria-hidden="true">{menuOpen ? '×' : '☰'}</span>
            <span className="sr-only">القائمة</span>
          </button>

          <nav
            id="app-nav"
            className={`nav nav--app${menuOpen ? ' nav--open' : ''}`}
            aria-label="تنقل لوحة التحكم"
          >
            {items.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} onClick={closeMenu}>
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="header-actions">
            <Link to="/" className="nav-link-button" onClick={closeMenu}>
              الموقع العام
            </Link>
            <button type="button" className="nav-button" onClick={handleLogout}>
              خروج
            </button>
          </div>
        </div>

        <div className="app-session">
          <span className="app-session-user">
            <strong>{user.firstName} {user.lastName}</strong>
            <span className="app-session-role">{ROLE_LABELS[role] ?? role}</span>
          </span>

          {organization && (
            <span className="app-session-org">
              <span className="app-session-org-name">{organization.name}</span>
              <Badge tone={isVerified ? 'success' : 'warning'}>
                {VERIFICATION_LABELS[organization.verificationStatus] ??
                  organization.verificationStatus}
              </Badge>
            </span>
          )}
        </div>

        {!isVerified && role !== 'ADMIN' && (
          <p className="verification-notice" role="status">
            <span aria-hidden="true">◔</span>
            {organization?.verificationStatus === 'REJECTED'
              ? 'رُفض اعتماد منظمك، لذلك لا يمكنك حейчасرتك في عمليات التبرع.'
              : 'منظّمك قيد المراجعة. ستظهر لك أزرار النشر والطلب فور اعتماده من إدارة المنصة.'}
          </p>
        )}
      </header>

      <main className="main main--app">
        <Outlet />
      </main>

      <footer className="footer footer--app">
        <div className="footer-inner">
          <span className="footer-brand">نِعمة</span>
          <p className="footer-tagline">فائض النهار، رزق لغيرك</p>
        </div>
      </footer>
    </div>
  );
}

export default AppLayout;

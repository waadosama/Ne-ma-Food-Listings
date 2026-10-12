import { Link, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Loading from './ui/Loading.jsx';
import EmptyState from './ui/EmptyState.jsx';
import { ROLE_LABELS, VERIFICATION_LABELS } from '../utils/format.js';

// Frontend route guard.
//
// This exists so a visitor does not land on a blank dashboard they cannot
// use — it is navigation, not security. Every one of these screens still
// calls an endpoint that re-checks the token, the role and the organization
// on the server, and every write is authorized there again. Hiding a button
// here never becomes permission to do the thing behind it.
export default function ProtectedRoute({ roles, children }) {
  const { user, status } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <Loading full label="جارٍ التحقق من الجلسة…" />;

  if (!user) {
    // Remember where they were headed so login can send them straight back.
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (roles && !roles.includes(user.role)) {
    return <AccessDenied role={user.role} attempted={roles} />;
  }

  return children;
}

// A wrong-role visit renders an explanation rather than a silent redirect:
// bouncing a restaurant off /charity back to /restaurant with no message
// looks like the link simply did nothing.
function AccessDenied({ role, attempted }) {
  const { homePath, isVerified, organization } = useAuth();
  const allowed = attempted.map((r) => ROLE_LABELS[r] ?? r).join(' أو ');

  const verification =
    role !== 'ADMIN' && !isVerified
      ? VERIFICATION_LABELS[organization?.verificationStatus]
      : null;

  return (
    <div className="page page--centered">
      <EmptyState
        icon="⛔"
        title="ليست لديك صلاحية لعرض هذه الصفحة"
        hint={
          role === 'ADMIN'
            ? `هذه الصفحة متاحة لـ ${allowed} فقط.`
            : `هذه الصفحة متاحة لـ ${allowed} فقط، ودورك الحالي هو ${ROLE_LABELS[role] ?? role}.`
        }
      />
      {verification && (
        <p className="page-note">
          حالة اعتماد منظمك: <strong>{verification}</strong>
        </p>
      )}
      <div className="page-actions">
        <Link className="btn btn--primary" to={homePath}>
          الانتقال إلى لوحتي
        </Link>
      </div>
    </div>
  );
}

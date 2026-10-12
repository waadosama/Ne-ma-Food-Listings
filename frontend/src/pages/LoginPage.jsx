import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, homePathFor } from '../context/AuthContext.jsx';
import { ApiError } from '../services/api.js';
import Alert from '../components/ui/Alert.jsx';
import { TextField } from '../components/ui/Field.jsx';

// Sign-in. The backend answers unknown email and wrong password with the
// same 401 INVALID_CREDENTIALS, so this form never becomes a way to test
// which addresses are registered.

export default function LoginPage() {
  const { login, isAuthenticated, status, homePath } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [values, setValues] = useState({ email: '', password: '' });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  // Already signed in: go where they were headed, or to their own dashboard.
  if (status === 'ready' && isAuthenticated) {
    return <Navigate to={location.state?.from || homePath} replace />;
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    try {
      const signedIn = await login(values);
      const from = location.state?.from;
      navigate(from || homePathFor(signedIn), { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.fieldErrors());
      } else {
        setError('تعذّر تسجيل الدخول. حاول مرة أخرى.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="page page--narrow page-auth">
      <div className="page-intro">
        <span className="eyebrow">أهلاً بعودتك</span>
        <h1>تسجيل الدخول</h1>
        <p className="page-lede">
          ادخل إلى لوحتك لإدارة العروض أو متابعة طلباتك.
        </p>
      </div>

      <form className="card form" onSubmit={handleSubmit} noValidate>
        {error && (
          <Alert tone="error" title="تعذّر تسجيل الدخول">
            {error}
          </Alert>
        )}

        <TextField
          label="البريد الإلكتروني"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          dir="ltr"
          required
          value={values.email}
          onChange={handleChange}
          error={fieldErrors.email}
        />

        <TextField
          label="كلمة المرور"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          value={values.password}
          onChange={handleChange}
          error={fieldErrors.password}
        />

        <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
          {submitting ? 'جارٍ الدخول…' : 'دخول'}
        </button>

        <p className="form-footnote">
          ليس لديك حساب؟ <Link to="/register">أنشئ حساباً جديداً</Link>
        </p>
      </form>
    </section>
  );
}

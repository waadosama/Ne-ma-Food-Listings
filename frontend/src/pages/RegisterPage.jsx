import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { useAuth, homePathFor } from '../context/AuthContext.jsx';
import { ApiError } from '../services/api.js';
import Alert from '../components/ui/Alert.jsx';
import { TextField, TextAreaField, SelectField } from '../components/ui/Field.jsx';
import { ORG_TYPE_LABELS } from '../utils/format.js';

// Registration creates a user *and* its organization in one call, and the
// new organization always starts PENDING — no field in this form can
// self-verify, because the backend never reads a verification value from
// the payload at all.

const ORG_TYPES_BY_ROLE = {
  RESTAURANT: ['RESTAURANT', 'BAKERY', 'GROCERY'],
  CHARITY: ['CHARITY', 'NGO'],
};

const INITIAL = {
  role: 'CHARITY',
  firstName: '',
  lastName: '',
  email: '',
  password: '',
  phone: '',
  orgType: 'CHARITY',
  orgName: '',
  city: '',
  addressLine: '',
  description: '',
};

export default function RegisterPage() {
  const { register, isAuthenticated, status, homePath } = useAuth();
  const navigate = useNavigate();

  const [values, setValues] = useState(INITIAL);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});

  if (status === 'ready' && isAuthenticated) {
    return <Navigate to={homePath} replace />;
  }

  function setField(name, value) {
    setValues((prev) => ({ ...prev, [name]: value }));
  }

  function handleChange(event) {
    const { name, value } = event.target;
    setField(name, value);
  }

  // Switching role swaps the organization type with it, so the form can
  // never offer a CHARITY account a RESTAURANT organization — the backend
  // refuses that pair anyway (ORGANIZATION_TYPE_MISMATCH), this just stops
  // the user from hitting the error.
  function selectRole(role) {
    setValues((prev) => ({
      ...prev,
      role,
      orgType: ORG_TYPES_BY_ROLE[role][0],
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setFieldErrors({});

    const payload = {
      role: values.role,
      email: values.email.trim(),
      password: values.password,
      firstName: values.firstName.trim(),
      lastName: values.lastName.trim(),
      organization: {
        type: values.orgType,
        name: values.orgName.trim(),
        addressLine: values.addressLine.trim(),
        city: values.city.trim(),
        ...(values.description.trim() ? { description: values.description.trim() } : {}),
        ...(values.phone.trim() ? { contactPhone: values.phone.trim() } : {}),
      },
    };

    try {
      const created = await register(payload);
      navigate(created.role === 'ADMIN' ? '/admin' : homePathFor(created), { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setFieldErrors(err.fieldErrors());
      } else {
        setError('تعذّر إنشاء الحساب. حاول مرة أخرى.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  const orgTypeOptions = ORG_TYPES_BY_ROLE[values.role].map((value) => ({
    value,
    label: ORG_TYPE_LABELS[value],
  }));

  return (
    <section className="page page--wide page-auth">
      <div className="page-intro">
        <span className="eyebrow">انضم إلى نِعمة</span>
        <h1>إنشاء حساب</h1>
        <p className="page-lede">
          اختر دورك، أدخل بيانات منظمك، وسيراجعها فريق المنصة قبل تفعيل المشاركة
          في عمليات التبرع.
        </p>
      </div>

      <form className="card form" onSubmit={handleSubmit} noValidate>
        {error && (
          <Alert tone="error" title="تعذّر إنشاء الحساب">
            {error}
          </Alert>
        )}

        <fieldset className="fieldset">
          <legend className="field-label">أنا أقدّم الطعام</legend>
          <div className="segmented" role="radiogroup" aria-label="نوع الحساب">
            {['RESTAURANT', 'CHARITY'].map((role) => (
              <label
                key={role}
                className={`segmented-option${values.role === role ? ' is-selected' : ''}`}
              >
                <input
                  type="radio"
                  name="role"
                  value={role}
                  checked={values.role === role}
                  onChange={() => selectRole(role)}
                  className="sr-only"
                />
                <span className="segmented-title">
                  {role === 'RESTAURANT' ? 'أقدّم فائضاً (مطعم / مخبز)' : 'أستلم فائضاً (جمعية)'}
                </span>
                <span className="segmented-hint">
                  {role === 'RESTAURANT'
                    ? 'تنشر فائض الطعام وتراجع الطلبات الواردة.'
                    : 'تطلب الكمية التي تحتاجها وتؤكّد استلامها.'}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="form-grid">
          <TextField
            label="الاسم الأول"
            name="firstName"
            autoComplete="given-name"
            required
            value={values.firstName}
            onChange={handleChange}
            error={fieldErrors.firstName}
          />
          <TextField
            label="اسم العائلة"
            name="lastName"
            autoComplete="family-name"
            required
            value={values.lastName}
            onChange={handleChange}
            error={fieldErrors.lastName}
          />
          <TextField
            label="البريد الإلكتروني"
            name="email"
            type="email"
            autoComplete="email"
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
            autoComplete="new-password"
            hint="ثمانية أحرف على الأقل."
            required
            minLength={8}
            value={values.password}
            onChange={handleChange}
            error={fieldErrors.password}
          />
          <TextField
            label="رقم الجوال"
            name="phone"
            type="tel"
            autoComplete="tel"
            dir="ltr"
            hint="اختياري — يُستخدم للتواصل أثناء تنسيق الاستلام."
            value={values.phone}
            onChange={handleChange}
            error={fieldErrors.phone}
          />
          <SelectField
            label="نوع المنظّم"
            name="orgType"
            required
            options={orgTypeOptions}
            value={values.orgType}
            onChange={handleChange}
            error={fieldErrors['organization.type']}
          />
        </div>

        <div className="form-section-title">
          <h2>بيانات المنظّم</h2>
          <p>تظهر هذه البيانات للطرف الآخر عند التنسيق.</p>
        </div>

        <div className="form-grid">
          <TextField
            label="اسم المنظّم"
            name="orgName"
            required
            value={values.orgName}
            onChange={handleChange}
            error={fieldErrors['organization.name']}
          />
          <TextField
            label="المدينة"
            name="city"
            required
            value={values.city}
            onChange={handleChange}
            error={fieldErrors['organization.city']}
          />
        </div>

        <TextField
          label="العنوان"
          name="addressLine"
          hint="العنوان الذي سيُسلَّم منه أو يُستلم عنده الطعام."
          required
          value={values.addressLine}
          onChange={handleChange}
          error={fieldErrors['organization.addressLine']}
        />

        <TextAreaField
          label="نبذة (اختياري)"
          name="description"
          rows={3}
          value={values.description}
          onChange={handleChange}
          error={fieldErrors['organization.description']}
        />

        <Alert tone="info">
          حسابات المنظمات تبدأ بحالة «بانتظار الاعتماد». لن تتمكن من النشر أو
          الطلب حتى يعتمد مسؤول المنصّة منظمك.
        </Alert>

        <button type="submit" className="btn btn--primary btn--block" disabled={submitting}>
          {submitting ? 'جارٍ إنشاء الحساب…' : 'إنشاء الحساب'}
        </button>

        <p className="form-footnote">
          لديك حساب بالفعل؟ <Link to="/login">سجّل دخولك</Link>
        </p>
      </form>
    </section>
  );
}

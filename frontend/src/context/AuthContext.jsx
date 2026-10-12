import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { authApi, getToken, setToken, clearToken, ApiError } from '../services/api.js';

// Who is signed in, and the four operations that change that.
//
// The user object is never authoritative. On boot the context asks the
// backend for `/auth/me` and uses whatever comes back, so a role change, a
// deactivation or a pulled verification takes effect on the very next page
// load without the browser holding onto stale privileges. Frontend routing
// uses this state for convenience only — every request still carries the
// token and every write is re-authorized server-side.

const AuthContext = createContext(null);

const HOME_BY_ROLE = {
  ADMIN: '/admin',
  RESTAURANT: '/restaurant',
  CHARITY: '/charity',
};

export function homePathFor(user) {
  if (!user) return '/';
  return HOME_BY_ROLE[user.role] || '/';
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // 'loading' | 'ready'
  const [bootError, setBootError] = useState(null);

  const loadSession = useCallback(async () => {
    if (!getToken()) {
      setUser(null);
      setStatus('ready');
      setBootError(null);
      return;
    }

    try {
      const { user: me } = await authApi.me();
      setUser(me);
      setBootError(null);
    } catch (error) {
      // 401 means the token expired or the account is gone — drop it so the
      // app stops presenting itself as signed in. Anything else (offline,
      // backend restarting) keeps the token so a reload can recover.
      if (error instanceof ApiError && error.status === 401) {
        clearToken();
        setUser(null);
      }
      setBootError(error instanceof ApiError && error.status !== 401 ? error.message : null);
    } finally {
      setStatus('ready');
    }
  }, []);

  useEffect(() => {
    loadSession();
  }, [loadSession]);

  const login = useCallback(async (credentials) => {
    const { token, user: signedIn } = await authApi.login(credentials);
    setToken(token);
    setUser(signedIn);
    // Re-read the profile rather than trusting the login payload, so the
    // shape every component consumes always comes from /auth/me.
    try {
      const { user: fresh } = await authApi.me();
      setUser(fresh);
    } catch {
      /* the login payload is an acceptable fallback for this once */
    }
    return signedIn;
  }, []);

  const register = useCallback(async (payload) => {
    const { token, user: created } = await authApi.register(payload);
    setToken(token);
    setUser(created);
    try {
      const { user: fresh } = await authApi.me();
      setUser(fresh);
    } catch {
      /* fallback as above */
    }
    return created;
  }, []);

  const logout = useCallback(() => {
    clearToken();
    setUser(null);
  }, []);

  const value = useMemo(() => {
    const role = user?.role ?? null;
    const organization = user?.organization ?? null;
    const isVerified = organization?.verificationStatus === 'VERIFIED';

    return {
      user,
      role,
      organization,
      isVerified,
      status,
      bootError,
      isAuthenticated: Boolean(user),
      isRole: (...roles) => roles.includes(role),
      login,
      register,
      logout,
      refresh: loadSession,
      homePath: homePathFor(user),
    };
  }, [user, status, bootError, login, register, logout, loadSession]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>');
  return context;
}

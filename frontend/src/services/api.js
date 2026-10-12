// The single place the frontend talks to the backend.
//
// Everything here is transport only: build the URL, attach the token, parse
// the response, and turn a failure into a typed ApiError carrying the
// backend's own `code` / `message` / `details`. No component ever calls
// fetch directly, and no component ever invents data — there is no mock
// layer in this file or anywhere downstream of it.
//
// In development the Vite dev server proxies `/api` to the Express backend,
// so the app talks to a single origin and needs no CORS setup.

const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

const TOKEN_KEY = 'nema.token';

// ---------------------------------------------------------------------
// Session token
// ---------------------------------------------------------------------
// Kept here rather than in the auth context because it is a property of the
// transport: every request needs it, and the context should not have to
// thread a token through props to reach the network layer.

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    // Storage can be unavailable (private mode, blocked cookies). The app
    // still works; it simply cannot persist a session across reloads.
    return null;
  }
}

export function setToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* non-fatal */
  }
}

export function clearToken() {
  setToken(null);
}

// ---------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------

export class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message || 'The request failed.');
    this.name = 'ApiError';
    this.status = status;
    this.code = code || 'UNKNOWN_ERROR';
    this.details = Array.isArray(details) ? details : [];
  }

  // { field: message } — the shape a controlled form wants for inline errors.
  // The backend namespaces nested problems (e.g. "organization.type"), so
  // the raw key is preserved and forms can look it up directly.
  fieldErrors() {
    return this.details.reduce((acc, item) => {
      if (item?.field) acc[item.field] = item.message;
      return acc;
    }, {});
  }
}

// ---------------------------------------------------------------------
// Core request helper
// ---------------------------------------------------------------------

async function request(path, { method = 'GET', body, query, auth = true } = {}) {
  const url = new URL(`${API_BASE}${path}`, window.location.origin);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined && value !== null && value !== '') {
        url.searchParams.set(key, String(value));
      }
    }
  }

  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(url.toString(), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    // Network-level failure (backend down, offline). Surfaced with a code
    // so the UI can distinguish "the server said no" from "no server".
    throw new ApiError(0, 'NETWORK_ERROR', 'تعذّر الاتصال بالخادم. تحقّق من اتصالك ثم أعد المحاولة.');
  }

  if (response.status === 204) return null;

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    if (!response.ok) {
      throw new ApiError(response.status, 'INVALID_RESPONSE', `HTTP ${response.status}`);
    }
    return null;
  }

  if (!response.ok) {
    throw new ApiError(response.status, payload?.code, payload?.message, payload?.details);
  }

  return payload;
}

// ---------------------------------------------------------------------
// Health
// ---------------------------------------------------------------------

export const healthApi = {
  get: () => request('/health', { auth: false }),
};

// ---------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------

export const authApi = {
  // -> { user, token }
  login: (credentials) => request('/auth/login', { method: 'POST', body: credentials, auth: false }),

  // -> { user, token }. The backend creates the organization too, and
  // always starts it PENDING — no payload here can self-verify.
  register: (payload) => request('/auth/register', { method: 'POST', body: payload, auth: false }),

  // -> { user }. Re-read from the database on every call, so role,
  // active status and verification are never trusted from storage.
  me: () => request('/auth/me'),

  updateMe: (payload) => request('/auth/me', { method: 'PATCH', body: payload }),
};

// ---------------------------------------------------------------------
// Listings — restaurant side (and admin oversight)
// ---------------------------------------------------------------------

export const listingsApi = {
  list: ({ status, limit, offset } = {}) =>
    request('/food-listings', { query: { status, limit, offset } }),

  get: (id) => request(`/food-listings/${id}`),

  create: (payload) => request('/food-listings', { method: 'POST', body: payload }),

  update: (id, payload) => request(`/food-listings/${id}`, { method: 'PATCH', body: payload }),

  cancel: (id, reason) => request(`/food-listings/${id}/cancel`, { method: 'PATCH', body: { reason } }),

  // The restaurant's inbox for one listing.
  listRequests: (id, { limit, offset } = {}) =>
    request(`/food-listings/${id}/requests`, { query: { limit, offset } }),

  // Approve or reject. Backend re-checks ownership, status and quantity.
  decide: (id, requestId, payload) =>
    request(`/food-listings/${id}/requests/${requestId}`, { method: 'PATCH', body: payload }),
};

// ---------------------------------------------------------------------
// Browse — charity side
// ---------------------------------------------------------------------

export const browseApi = {
  list: ({ category, pickupBefore, limit, offset } = {}) =>
    request('/browse/listings', { query: { category, pickupBefore, limit, offset } }),

  details: (id) => request(`/browse/listings/${id}`),
};

// ---------------------------------------------------------------------
// Requests — charity side (admin may read)
// ---------------------------------------------------------------------

export const requestsApi = {
  create: (payload) => request('/requests', { method: 'POST', body: payload }),

  list: ({ status, limit, offset } = {}) =>
    request('/requests', { query: { status, limit, offset } }),

  get: (id) => request(`/requests/${id}`),

  cancel: (id, reason) => request(`/requests/${id}/cancel`, { method: 'PATCH', body: { reason } }),

  // The required collection confirmation. Only this call creates a donation.
  collect: (id, handoverNotes) =>
    request(`/requests/${id}/collect`, { method: 'POST', body: { handoverNotes } }),
};

// ---------------------------------------------------------------------
// Organizations — verification queue (admin) and public directory
// ---------------------------------------------------------------------

export const organizationsApi = {
  list: ({ status, limit, offset } = {}) =>
    request('/organizations', { query: { status, limit, offset } }),

  get: (id) => request(`/organizations/${id}`),

  verify: (id, payload) => request(`/organizations/${id}/verify`, { method: 'PATCH', body: payload }),
};

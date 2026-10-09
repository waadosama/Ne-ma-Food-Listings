// Central place for all API calls.
// In development the Vite dev server proxies `/api` to the Express backend,
// so we can call the API with a relative path and avoid CORS setup.
const API_BASE = import.meta.env.VITE_API_BASE_URL || '/api';

async function request(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

export function getHealth() {
  return request('/health');
}

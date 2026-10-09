import { useEffect, useState } from 'react';
import { getHealth } from '../services/api.js';

// Small diagnostic panel: fetches /api/health through the Vite proxy so we
// can confirm the frontend, the proxy and the backend are all wired together.
function HealthStatus() {
  const [status, setStatus] = useState({ state: 'loading' });

  useEffect(() => {
    let cancelled = false;

    getHealth()
      .then((data) => {
        if (!cancelled) setStatus({ state: 'ok', data });
      })
      .catch((error) => {
        if (!cancelled) setStatus({ state: 'error', message: error.message });
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className={`health health--${status.state}`} dir="ltr">
      <strong>API status: </strong>
      {status.state === 'loading' && <span>checking…</span>}
      {status.state === 'ok' && (
        <span>
          {status.data.status} — {status.data.message} (uptime{' '}
          {Math.round(status.data.uptime)}s)
        </span>
      )}
      {status.state === 'error' && <span>unreachable ({status.message})</span>}
    </div>
  );
}

export default HealthStatus;

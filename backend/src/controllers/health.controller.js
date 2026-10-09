import { getHealthStatus } from '../services/health.service.js';

// Controllers only handle HTTP concerns: read the request, call a service,
// send the response. They should not contain business logic.
export function getHealth(req, res) {
  res.json(getHealthStatus());
}

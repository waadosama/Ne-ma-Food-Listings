// Business logic for the health check. Kept separate from the controller
// so it can grow (e.g. a database ping) without touching HTTP code.
export function getHealthStatus() {
  return {
    status: 'ok',
    message: "Ne'ma API is running",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  };
}

// Catch-all for any request that did not match a route. Always registered
// after the route files.
export function notFound(req, res, next) {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.originalUrl} does not exist`,
  });
}

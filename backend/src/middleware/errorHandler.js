// Centralized error handler. Express picks this up automatically because
// it takes four arguments. Any thrown/rejected error in a route lands here.
export function errorHandler(err, req, res, next) {
  // Log the stack in development so failures are easy to trace.
  if (process.env.NODE_ENV !== 'production') {
    console.error(err);
  }

  const status = err.status || 500;

  res.status(status).json({
    error: err.name || 'Internal Server Error',
    message:
      status === 500 && process.env.NODE_ENV === 'production'
        ? 'Something went wrong'
        : err.message,
  });
}

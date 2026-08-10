export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

export function notFound(req, res) {
  res.status(404).json({
    error: 'Not Found',
    message: `Route ${req.method} ${req.path} does not exist`,
  });
}

export function errorHandler(err, req, res, _next) {
  console.error(err);

  const status = err.status ?? 500;
  res.status(status).json({
    error: err.code ?? err.name ?? 'Internal Server Error',
    message: err.message ?? 'Something went wrong',
    ...(err.categories && { categories: err.categories }),
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack }),
  });
}

export class AppError extends Error {
  constructor(message, status = 500, code = 'INTERNAL_ERROR') {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}

export function insufficientEnergy(action, cost, remaining) {
  return new AppError(
    `Not enough energy for "${action}" (cost: ${cost}, remaining: ${remaining ?? 0})`,
    409,
    'INSUFFICIENT_ENERGY'
  );
}

export function notFound(resource) {
  return new AppError(`${resource} not found`, 404, 'NOT_FOUND');
}

export function validationError(message) {
  return new AppError(message, 400, 'VALIDATION_ERROR');
}

export function contentModerationError(message, categories = []) {
  const err = new AppError(message, 422, 'CONTENT_MODERATION');
  err.categories = categories;
  return err;
}

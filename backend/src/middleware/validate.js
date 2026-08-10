/**
 * Request body validation and sanitization via Zod schemas.
 */

export function validateBody(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body ?? {});

    if (!result.success) {
      const messages = result.error.errors.map((issue) => issue.message);
      return res.status(400).json({
        error: 'VALIDATION_ERROR',
        message: messages.join('; '),
        details: result.error.flatten(),
      });
    }

    req.body = result.data;
    return next();
  };
}

/**
 * Strip common XSS/injection patterns from string fields (defense in depth).
 */
export function sanitizeStrings(obj) {
  if (obj == null || typeof obj !== 'object') return obj;

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === 'string') {
      obj[key] = value
        .replace(/[\u0000-\u001F\u007F]/g, '')
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      sanitizeStrings(value);
    }
  }

  return obj;
}

export function sanitizeBody(req, _res, next) {
  if (req.body && typeof req.body === 'object') {
    sanitizeStrings(req.body);
  }
  next();
}

import { logEventsBatch } from '../services/analyticsService.js';
import { validationError } from '../utils/errors.js';

const ALLOWED_CLIENT_EVENTS = new Set([
  'screen_view',
  'tab_selected',
  'store_opened',
  'compose_opened',
  'explore_viewed',
  'profile_viewed',
]);

export async function ingestClientEvents(req, res) {
  const { events } = req.body;

  if (!Array.isArray(events) || events.length === 0) {
    throw validationError('events array is required');
  }

  const sanitized = events.slice(0, 25).map((event) => ({
    userId: req.user.id,
    eventType: event.eventType ?? event.event_type,
    metadata: {
      ...(event.metadata ?? {}),
      source: 'client',
    },
  }));

  for (const event of sanitized) {
    if (!event.eventType || !ALLOWED_CLIENT_EVENTS.has(event.eventType)) {
      throw validationError(`Invalid or disallowed event type: ${event.eventType}`);
    }
  }

  await logEventsBatch(sanitized);
  res.status(202).json({ accepted: sanitized.length });
}

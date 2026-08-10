import { query } from '../config/database.js';

export async function logEvent({ userId = null, eventType, metadata = {} }) {
  if (!eventType) return;

  try {
    await query(
      `INSERT INTO analytics_events (user_id, event_type, metadata)
       VALUES ($1, $2, $3)`,
      [userId, eventType, JSON.stringify(metadata)]
    );
  } catch (err) {
    console.warn('[Analytics] Failed to log event:', err.message);
  }
}

export async function logEventsBatch(events) {
  if (!Array.isArray(events) || events.length === 0) return;

  for (const event of events) {
    await logEvent(event);
  }
}

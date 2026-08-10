import { query } from '../config/database.js';
import { captureEvent } from '../services/posthogService.js';
import { logEvent } from '../services/analyticsService.js';

export async function submitFeedback(req, res) {
  const userId = req.user.id;
  const { category, message, deviceState, featureFlags } = req.body;

  const { rows } = await query(
    `INSERT INTO user_feedback (user_id, category, message, device_state, feature_flags)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, category, created_at`,
    [
      userId,
      category,
      message,
      JSON.stringify(deviceState ?? {}),
      JSON.stringify(featureFlags ?? {}),
    ],
  );

  const feedback = rows[0];

  const flagProperties = {};
  if (featureFlags && typeof featureFlags === 'object') {
    for (const [key, value] of Object.entries(featureFlags)) {
      flagProperties[`$feature/${key}`] = value;
    }
  }

  captureEvent(userId, 'user_feedback_submitted', {
    category,
    feedback_id: feedback.id,
    message_length: message.length,
    ...flagProperties,
    device_platform: deviceState?.platform,
  });

  await logEvent({
    userId,
    eventType: 'user_feedback',
    metadata: { category, feedbackId: feedback.id },
  });

  res.status(201).json({ data: feedback });
}

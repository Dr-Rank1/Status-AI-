/**
 * Phase 40 — Ambient suggestion engine (server side).
 * Turns ambient context snippets into proactive swarm actions (no wake word).
 */

import crypto from 'crypto';
import { logger } from '../../utils/logger.js';
import { assertAgentsNotKilled } from '../security/globalKillSwitchService.js';
import { appendAuditEvent } from '../security/immutableAuditLedger.js';
import { analyzePromptComplexity } from '../orchestration/puppeteerOrchestrator.js';

/**
 * Infer proactive suggestions from ambient transcript / activity / location hints.
 */
export function inferAmbientSuggestions({
  transcript = '',
  activity = null,
  locationLabel = null,
  calendarBusy = false,
  recentIntent = null,
} = {}) {
  const text = String(transcript).toLowerCase();
  const suggestions = [];

  if (/meet|schedule|tomorrow|calendar|lunch/.test(text) || activity === 'planning') {
    suggestions.push({
      id: crypto.randomUUID(),
      type: 'schedule',
      confidence: 0.72,
      title: 'Draft calendar hold',
      action: 'create_calendar_event',
      payload: { title: 'Follow-up', duration_minutes: 30 },
    });
  }

  if (/remind|don't forget|todo|later/.test(text)) {
    suggestions.push({
      id: crypto.randomUUID(),
      type: 'remind',
      confidence: 0.68,
      title: 'Capture reminder',
      action: 'draft_reminder',
      payload: { text: transcript.slice(0, 160) },
    });
  }

  if (/reply|email|message|tell them|respond/.test(text)) {
    suggestions.push({
      id: crypto.randomUUID(),
      type: 'draft_reply',
      confidence: 0.7,
      title: 'Draft reply in background',
      action: 'draft_message',
      payload: { seed: transcript.slice(0, 240) },
    });
  }

  if (/search|look up|what is|who is/.test(text)) {
    suggestions.push({
      id: crypto.randomUUID(),
      type: 'retrieve',
      confidence: 0.75,
      title: 'Retrieve ambient context',
      action: 'web_search',
      payload: { query: transcript.slice(0, 120) },
    });
  }

  if (locationLabel && /office|home|transit/.test(String(locationLabel).toLowerCase())) {
    suggestions.push({
      id: crypto.randomUUID(),
      type: 'context',
      confidence: 0.55,
      title: `Adapt for ${locationLabel}`,
      action: 'spatial_ambient_adapt',
      payload: { locationLabel },
    });
  }

  if (calendarBusy) {
    suggestions.push({
      id: crypto.randomUUID(),
      type: 'focus',
      confidence: 0.6,
      title: 'Silence non-urgent prompts',
      action: 'defer_notifications',
      payload: {},
    });
  }

  if (!suggestions.length && text.length > 12) {
    suggestions.push({
      id: crypto.randomUUID(),
      type: 'observe',
      confidence: 0.4,
      title: 'Continue ambient observation',
      action: 'noop',
      payload: { recentIntent },
    });
  }

  const complexity = analyzePromptComplexity(transcript);
  return {
    suggestions: suggestions.sort((a, b) => b.confidence - a.confidence).slice(0, 5),
    complexity,
    ambient: true,
    wakeWordRequired: false,
  };
}

/**
 * Accept an ambient suggestion and record for swarm execution (async).
 */
export async function acceptAmbientSuggestion({
  suggestion,
  userId,
  characterId = null,
} = {}) {
  assertAgentsNotKilled();
  const job = {
    id: crypto.randomUUID(),
    suggestion,
    userId,
    characterId,
    status: 'queued',
    at: new Date().toISOString(),
  };

  await appendAuditEvent({
    type: 'ambient.accept',
    actor: 'ambient_fabric',
    action: suggestion?.action ?? 'unknown',
    decision: 'queued',
    metadata: { jobId: job.id, type: suggestion?.type },
    userId,
    characterId,
  });

  logger.info(`[Ambient] queued ${suggestion?.type} job=${job.id.slice(0, 8)}`);
  return job;
}

export function getAmbientConfig() {
  return {
    wakeWordRequired: false,
    platforms: ['ios', 'android', 'ubuntu'],
    proactive: true,
    privacy: 'on_device_first',
  };
}

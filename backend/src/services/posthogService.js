/**
 * PostHog feature flags & event capture for dynamic rollouts and AI telemetry attribution.
 */

import { PostHog } from 'posthog-node';
import { logger } from '../utils/logger.js';

let client = null;

export function getPostHog() {
  const apiKey = process.env.POSTHOG_API_KEY;
  if (!apiKey) return null;

  if (!client) {
    client = new PostHog(apiKey, {
      host: process.env.POSTHOG_HOST ?? 'https://us.i.posthog.com',
      flushAt: 10,
      flushInterval: 5000,
    });
  }

  return client;
}

/**
 * Evaluate all feature flags for a user (PostHog local evaluation + remote fallback).
 * Returns flag values and `$feature/*` properties for event attribution.
 */
export async function evaluateFlags(distinctId, personProperties = {}) {
  const ph = getPostHog();
  if (!ph || !distinctId) {
    return { flags: {}, properties: {} };
  }

  try {
    const flags = await ph.getAllFlags(distinctId, { personProperties });
    return {
      flags: flags ?? {},
      properties: buildFlagSnapshotProperties(flags ?? {}),
    };
  } catch (err) {
    logger.warn('[PostHog] evaluateFlags failed:', err.message);
    return { flags: {}, properties: {} };
  }
}

export function buildFlagSnapshotProperties(flags) {
  const properties = {};
  for (const [key, value] of Object.entries(flags)) {
    properties[`$feature/${key}`] = value;
  }
  return properties;
}

export function isFlagEnabled(flags, key) {
  const value = flags?.[key];
  return value === true || value === 'true' || value === 1 || value === '1';
}

export function captureEvent(distinctId, event, properties = {}) {
  const ph = getPostHog();
  if (!ph || !distinctId) return;

  try {
    ph.capture({
      distinctId,
      event,
      properties: {
        ...properties,
        source: 'status-backend',
      },
    });
  } catch (err) {
    logger.warn('[PostHog] capture failed:', err.message);
  }
}

export async function shutdownPostHog() {
  if (client) {
    await client.shutdown();
    client = null;
  }
}

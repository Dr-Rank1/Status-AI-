/**
 * Alerting — Slack / PagerDuty notifications for production incidents.
 */

import { logger } from '../utils/logger.js';

const SLACK_WEBHOOK = process.env.SLACK_ALERT_WEBHOOK_URL ?? '';
const PAGERDUTY_KEY = process.env.PAGERDUTY_ROUTING_KEY ?? '';

export async function dispatchAlert({ title, severity = 'warning', details = {}, anomalyId = null }) {
  const payload = {
    title,
    severity,
    service: 'status-ai',
    timestamp: new Date().toISOString(),
    anomalyId,
    details,
  };

  const tasks = [];

  if (SLACK_WEBHOOK) {
    tasks.push(notifySlack(payload));
  }

  if (PAGERDUTY_KEY && (severity === 'critical' || severity === 'error')) {
    tasks.push(notifyPagerDuty(payload));
  }

  if (tasks.length === 0) {
    logger.warn(`[Alert] ${title} (no webhooks configured)`, details);
    return { dispatched: false };
  }

  await Promise.allSettled(tasks);
  return { dispatched: true, channels: { slack: Boolean(SLACK_WEBHOOK), pagerduty: Boolean(PAGERDUTY_KEY) } };
}

async function notifySlack(payload) {
  const color = payload.severity === 'critical' ? '#dc2626' : '#f59e0b';
  const body = {
    attachments: [
      {
        color,
        title: payload.title,
        fields: [
          { title: 'Severity', value: payload.severity, short: true },
          { title: 'Service', value: payload.service, short: true },
          { title: 'Details', value: '```' + JSON.stringify(payload.details, null, 2).slice(0, 800) + '```' },
        ],
        ts: Math.floor(Date.now() / 1000),
      },
    ],
  };

  const res = await fetch(SLACK_WEBHOOK, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`Slack webhook failed: ${res.status}`);
  }
}

async function notifyPagerDuty(payload) {
  const body = {
    routing_key: PAGERDUTY_KEY,
    event_action: 'trigger',
    payload: {
      summary: payload.title,
      severity: payload.severity === 'critical' ? 'critical' : 'warning',
      source: 'status-backend',
      custom_details: payload.details,
    },
  };

  const res = await fetch('https://events.pagerduty.com/v2/enqueue', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    throw new Error(`PagerDuty enqueue failed: ${res.status}`);
  }
}

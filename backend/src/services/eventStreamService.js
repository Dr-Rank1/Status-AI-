/**
 * Kafka / Redpanda event streaming backbone for decoupled consumers.
 */

import { Kafka, logLevel } from 'kafkajs';
import { logger } from '../utils/logger.js';
import { REGION_ID } from '../config/region.js';

const TOPICS = {
  ENERGY: process.env.KAFKA_TOPIC_ENERGY ?? 'status.energy.events',
  REPUTATION: process.env.KAFKA_TOPIC_REPUTATION ?? 'status.reputation.events',
};

let producer = null;
let connected = false;

function getBrokers() {
  const brokers = process.env.KAFKA_BROKERS ?? process.env.REDPANDA_BROKERS ?? '';
  return brokers
    .split(',')
    .map((b) => b.trim())
    .filter(Boolean);
}

export async function connectEventStream() {
  const brokers = getBrokers();
  if (brokers.length === 0) {
    logger.info('[EventStream] KAFKA_BROKERS not set — event publishing disabled');
    return null;
  }

  if (producer) return producer;

  const kafka = new Kafka({
    clientId: `status-api-${REGION_ID}`,
    brokers,
    logLevel: logLevel.WARN,
  });

  producer = kafka.producer({ allowAutoTopicCreation: true });

  try {
    await producer.connect();
    connected = true;
    logger.info(`[EventStream] Connected to ${brokers.join(', ')}`);
  } catch (err) {
    logger.warn('[EventStream] Failed to connect:', err.message);
    producer = null;
    connected = false;
  }

  return producer;
}

export function getEventStreamStatus() {
  return {
    enabled: getBrokers().length > 0,
    connected,
    topics: TOPICS,
    brokers: getBrokers(),
  };
}

export async function publishEvent(topic, eventType, payload) {
  if (!producer || !connected) return false;

  const message = {
    eventType,
    region: REGION_ID,
    timestamp: new Date().toISOString(),
    ...payload,
  };

  try {
    await producer.send({
      topic,
      messages: [
        {
          key: payload.userId ?? payload.user_id ?? undefined,
          value: JSON.stringify(message),
          headers: {
            'event-type': eventType,
            region: REGION_ID,
          },
        },
      ],
    });
    return true;
  } catch (err) {
    logger.warn(`[EventStream] Publish to ${topic} failed:`, err.message);
    return false;
  }
}

export async function publishEnergyEvent({ userId, action, spent, remaining, max }) {
  return publishEvent(TOPICS.ENERGY, 'energy_spent', {
    userId,
    action,
    spent,
    energy_remaining: remaining,
    energy_max: max,
  });
}

export async function publishReputationEvent({
  userId,
  characterId,
  reputation,
  reputationDelta,
  affinity,
  affinityDelta,
  interactionType,
}) {
  return publishEvent(TOPICS.REPUTATION, 'reputation_change', {
    userId,
    characterId,
    reputation,
    reputationDelta,
    affinity,
    affinityDelta,
    interactionType,
  });
}

export async function disconnectEventStream() {
  if (producer) {
    await producer.disconnect();
    producer = null;
    connected = false;
  }
}

export { TOPICS };

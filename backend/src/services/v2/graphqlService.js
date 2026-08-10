/**
 * Phase 31 — Lightweight GraphQL layer for V2 Beta (HTTP + Socket.IO subscriptions).
 * No Apollo dependency — fixed schema for ops, mesh, and reflection status.
 */

import { getSlaSnapshot } from '../../observability/slaTelemetry.js';
import { getCostSnapshot } from '../aiCostOptimizer.js';
import { getMeshBackend, fetchCollectiveInsights } from '../knowledgeMesh/knowledgeMeshService.js';
import { getSandboxConfig } from '../wasm/wasmToolSandbox.js';

const subscribers = new Map(); // id -> { socketId, fields }

export function graphqlSchemaSDL() {
  return `
    type Query {
      health: Health!
      sla: JSON
      cost: JSON
      knowledgeMesh(fandom: String, limit: Int): [Insight!]!
      sandbox: JSON
      version: String!
    }
    type Mutation {
      publishInsight(topic: String!, fandom: String): Insight
    }
    type Subscription {
      slaUpdated: JSON
      meshInsightPublished: Insight
    }
    type Health { ok: Boolean! api: String! }
    type Insight {
      id: ID
      topic: String!
      fandom: String!
      importance: Float
    }
    scalar JSON
  `;
}

export async function executeGraphql({ query, variables = {}, context = {} }) {
  const q = String(query ?? '').trim();

  if (/subscription/i.test(q) && /slaUpdated/i.test(q)) {
    return {
      data: null,
      extensions: {
        transport: 'socket.io',
        event: 'v2_graphql_subscribe',
        channel: 'slaUpdated',
      },
    };
  }

  if (/{\s*health\b/i.test(q) || /query\s*{\s*health/i.test(q)) {
    return { data: { health: { ok: true, api: 'v2' } } };
  }

  if (/\bversion\b/i.test(q) && /query/i.test(q)) {
    return { data: { version: '2.0.0' } };
  }

  if (/\bsla\b/i.test(q)) {
    return { data: { sla: getSlaSnapshot() } };
  }

  if (/\bcost\b/i.test(q)) {
    return { data: { cost: getCostSnapshot() } };
  }

  if (/\bsandbox\b/i.test(q)) {
    return { data: { sandbox: getSandboxConfig() } };
  }

  if (/knowledgeMesh/i.test(q)) {
    const fandom = variables.fandom ?? null;
    const limit = variables.limit ?? 5;
    const rows = await fetchCollectiveInsights({
      characterId: context.characterId ?? null,
      fandom,
      limit,
    });
    return {
      data: {
        knowledgeMesh: rows.map((r) => ({
          id: r.id,
          topic: r.topic,
          fandom: r.fandom,
          importance: r.importance,
        })),
      },
    };
  }

  if (/__schema|Introspection/i.test(q)) {
    return {
      data: {
        __schema: {
          queryType: { name: 'Query' },
          mutationType: { name: 'Mutation' },
          subscriptionType: { name: 'Subscription' },
          types: [{ name: 'Query' }, { name: 'Insight' }, { name: 'Health' }],
          sdl: graphqlSchemaSDL(),
        },
      },
    };
  }

  return {
    errors: [{ message: 'Unsupported GraphQL operation for V2 beta schema', path: [] }],
  };
}

export function registerGraphqlSubscriber(id, meta) {
  subscribers.set(id, meta);
  return id;
}

export function unregisterGraphqlSubscriber(id) {
  subscribers.delete(id);
}

export function listGraphqlSubscribers() {
  return [...subscribers.entries()];
}

export function getGraphqlMeshBackend() {
  return getMeshBackend();
}

/**
 * Phase 31 — Global Knowledge Mesh.
 * Shares abstracted, non-PII insights across characters (Neo4j when configured; Postgres fallback).
 */

import { query } from '../../config/database.js';
import { scrubPii } from '../fineTuning/piiScrubber.js';
import { logger } from '../../utils/logger.js';

const ENABLED = () => process.env.KNOWLEDGE_MESH_ENABLED !== 'false';

let neo4jDriver = null;

export async function initKnowledgeMesh() {
  if (!ENABLED()) return { backend: 'disabled' };
  const uri = process.env.NEO4J_URI;
  if (!uri) return { backend: 'postgres' };

  try {
    const neo4j = await import('neo4j-driver').catch(() => null);
    if (!neo4j) {
      logger.warn('[KnowledgeMesh] neo4j-driver not installed — using Postgres mesh');
      return { backend: 'postgres' };
    }
    neo4jDriver = neo4j.default.driver(
      uri,
      neo4j.default.auth.basic(
        process.env.NEO4J_USER ?? 'neo4j',
        process.env.NEO4J_PASSWORD ?? '',
      ),
    );
    await neo4jDriver.verifyConnectivity();
    logger.info('[KnowledgeMesh] Neo4j connected');
    return { backend: 'neo4j' };
  } catch (err) {
    logger.warn('[KnowledgeMesh] Neo4j unavailable:', err.message);
    neo4jDriver = null;
    return { backend: 'postgres' };
  }
}

/**
 * Abstract a memory into a non-PII insight suitable for global sharing.
 */
export function abstractInsight({ content, fandom = null, tags = [] }) {
  const scrubbed = scrubPii(String(content ?? '')).slice(0, 280);
  if (scrubbed.length < 12) return null;

  // Strip first-person identifiers / user handles already scrubbed
  const topic = scrubbed
    .replace(/\b(I|me|my|we|our)\b/gi, 'one')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return {
    topic,
    fandom: fandom ?? 'general',
    tags: Array.isArray(tags) ? tags.slice(0, 8) : [],
    abstraction: 'non_pii_v1',
  };
}

export async function publishInsight({
  characterId,
  tenantId = null,
  content,
  fandom = null,
  tags = [],
  importance = 0.5,
}) {
  if (!ENABLED()) return { skipped: true };

  const insight = abstractInsight({ content, fandom, tags });
  if (!insight) return { skipped: true, reason: 'empty_after_scrub' };

  const { rows } = await query(
    `INSERT INTO knowledge_mesh_insights (
       character_id, tenant_id, topic, fandom, tags, importance, abstraction
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6, $7)
     RETURNING id, topic, fandom, created_at`,
    [
      characterId,
      tenantId,
      insight.topic,
      insight.fandom,
      JSON.stringify(insight.tags),
      importance,
      insight.abstraction,
    ],
  );

  const record = rows[0];

  if (neo4jDriver) {
    const session = neo4jDriver.session();
    try {
      await session.run(
        `MERGE (c:Character {id: $characterId})
         MERGE (i:Insight {id: $insightId})
         SET i.topic = $topic, i.fandom = $fandom, i.importance = $importance
         MERGE (c)-[:CONTRIBUTED]->(i)
         WITH i
         UNWIND $tags AS tag
         MERGE (t:Tag {name: tag})
         MERGE (i)-[:TAGGED]->(t)`,
        {
          characterId: String(characterId),
          insightId: String(record.id),
          topic: insight.topic,
          fandom: insight.fandom,
          importance,
          tags: insight.tags.length ? insight.tags : ['general'],
        },
      );
    } catch (err) {
      logger.warn('[KnowledgeMesh] Neo4j write failed:', err.message);
    } finally {
      await session.close();
    }
  }

  return { insight: record, published: true };
}

/**
 * Pull collective insights for a character (same fandom / tags), excluding self PII sources.
 */
export async function fetchCollectiveInsights({
  characterId,
  fandom = null,
  limit = 5,
}) {
  if (!ENABLED()) return [];

  const { rows } = await query(
    `SELECT id, topic, fandom, tags, importance, created_at
     FROM knowledge_mesh_insights
     WHERE ($1::text IS NULL OR fandom = $1)
       AND character_id IS DISTINCT FROM $2
     ORDER BY importance DESC, created_at DESC
     LIMIT $3`,
    [fandom, characterId, limit],
  );

  return rows;
}

export async function linkMemoriesToMesh({ characterId, memoryContent, fandom, tenantId }) {
  return publishInsight({
    characterId,
    tenantId,
    content: memoryContent,
    fandom,
    tags: fandom ? [fandom] : [],
    importance: 0.55,
  });
}

export function getMeshBackend() {
  return neo4jDriver ? 'neo4j' : 'postgres';
}

export async function shutdownKnowledgeMesh() {
  if (neo4jDriver) {
    await neo4jDriver.close();
    neo4jDriver = null;
  }
}

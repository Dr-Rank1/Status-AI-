/**
 * Phase 35 — Temporal Knowledge Graph RAG.
 * Chronological + relational retrieval layered on ContextEngine (Neo4j or Postgres).
 *
 * Schema (Neo4j):
 *   (:User {id})-[:RELATES_TO {affinity, depth, validFrom, validTo}]->(:Character {id})
 *   (:Character)-[:REMEMBERS {validFrom, validTo, importance}]->(:Memory {id, content, embeddingRef})
 *   (:Memory)-[:EVOLVED_INTO {at, reason}]->(:Memory)
 *   (:Memory)-[:ABOUT]->(:Topic {name})
 *   (:Character)-[:INTERACTED {at, mode}]->(:User)
 */

import crypto from 'crypto';
import { query } from '../../config/database.js';
import { getNeo4jDriver } from '../knowledgeMesh/knowledgeMeshService.js';
import { logger } from '../../utils/logger.js';

const ENABLED = () => process.env.TEMPORAL_KG_ENABLED !== 'false';

export const TEMPORAL_KG_SCHEMA_CYPHER = `
// Status Temporal Knowledge Graph — Neo4j constraints & indexes (Phase 35)
// Relationship types: RELATES_TO, REMEMBERS, EVOLVED_INTO, ABOUT, INTERACTED
CREATE CONSTRAINT user_id IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE;
CREATE CONSTRAINT character_id IF NOT EXISTS FOR (c:Character) REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT memory_id IF NOT EXISTS FOR (m:Memory) REQUIRE m.id IS UNIQUE;
CREATE CONSTRAINT topic_name IF NOT EXISTS FOR (t:Topic) REQUIRE t.name IS UNIQUE;
CREATE INDEX memory_valid_from IF NOT EXISTS FOR (m:Memory) ON (m.validFrom);
CREATE INDEX relates_valid_from IF NOT EXISTS FOR ()-[r:RELATES_TO]-() ON (r.validFrom);
`;

/**
 * Apply Neo4j schema (idempotent). No-op without driver.
 */
export async function ensureTemporalGraphSchema() {
  const driver = getNeo4jDriver();
  if (!driver) return { applied: false, backend: 'postgres' };

  const session = driver.session();
  try {
    for (const stmt of TEMPORAL_KG_SCHEMA_CYPHER.split(';').map((s) => s.trim()).filter(Boolean)) {
      await session.run(stmt);
    }
    logger.info('[TemporalKG] Neo4j schema ensured');
    return { applied: true, backend: 'neo4j' };
  } catch (err) {
    logger.warn('[TemporalKG] schema apply failed:', err.message);
    return { applied: false, backend: 'neo4j', error: err.message };
  } finally {
    await session.close();
  }
}

/**
 * Record a memory version with optional evolution link.
 */
export async function recordTemporalMemory({
  characterId,
  userId = null,
  content,
  importance = 0.5,
  previousMemoryId = null,
  evolutionReason = null,
  topics = [],
  at = new Date().toISOString(),
}) {
  if (!ENABLED()) return { skipped: true };

  const memoryId = crypto.randomUUID();
  const driver = getNeo4jDriver();

  if (driver) {
    const session = driver.session();
    try {
      await session.run(
        `MERGE (c:Character {id: $characterId})
         CREATE (m:Memory {
           id: $memoryId,
           content: $content,
           importance: $importance,
           validFrom: datetime($at),
           validTo: null
         })
         MERGE (c)-[:REMEMBERS {validFrom: datetime($at), validTo: null, importance: $importance}]->(m)
         WITH m
         FOREACH (_ IN CASE WHEN $userId IS NULL THEN [] ELSE [1] END |
           MERGE (u:User {id: $userId})
           MERGE (c2:Character {id: $characterId})
           MERGE (c2)-[i:INTERACTED {mode: 'memory'}]->(u)
           SET i.at = datetime($at)
         )
         WITH m
         UNWIND $topics AS topic
         MERGE (t:Topic {name: topic})
         MERGE (m)-[:ABOUT]->(t)`,
        {
          characterId: String(characterId),
          userId: userId ? String(userId) : null,
          memoryId,
          content: String(content).slice(0, 2000),
          importance,
          at,
          topics: topics.length ? topics : ['general'],
        },
      );

      if (previousMemoryId) {
        await session.run(
          `MATCH (prev:Memory {id: $prevId}), (next:Memory {id: $nextId})
           SET prev.validTo = datetime($at)
           MERGE (prev)-[:EVOLVED_INTO {at: datetime($at), reason: $reason}]->(next)`,
          {
            prevId: String(previousMemoryId),
            nextId: memoryId,
            at,
            reason: evolutionReason ?? 'update',
          },
        );
      }
    } catch (err) {
      logger.warn('[TemporalKG] neo4j write failed:', err.message);
    } finally {
      await session.close();
    }
  }

  try {
    await query(
      `INSERT INTO temporal_memories (
         id, character_id, user_id, content, importance, previous_memory_id,
         evolution_reason, topics, valid_from
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)`,
      [
        memoryId,
        characterId,
        userId,
        String(content).slice(0, 2000),
        importance,
        previousMemoryId,
        evolutionReason,
        JSON.stringify(topics.length ? topics : ['general']),
        at,
      ],
    );
  } catch (err) {
    logger.warn('[TemporalKG] postgres write skipped:', err.message);
  }

  return { memoryId, recorded: true };
}

/**
 * Upsert relationship edge with temporal validity (affinity / depth).
 */
export async function upsertTemporalRelation({
  userId,
  characterId,
  affinity = 0,
  depth = 1,
  at = new Date().toISOString(),
}) {
  if (!ENABLED()) return { skipped: true };

  const driver = getNeo4jDriver();
  if (driver) {
    const session = driver.session();
    try {
      await session.run(
        `MERGE (u:User {id: $userId})
         MERGE (c:Character {id: $characterId})
         OPTIONAL MATCH (u)-[old:RELATES_TO {validTo: null}]->(c)
         FOREACH (_ IN CASE WHEN old IS NULL THEN [] ELSE [1] END |
           SET old.validTo = datetime($at)
         )
         MERGE (u)-[r:RELATES_TO {validFrom: datetime($at)}]->(c)
         SET r.affinity = $affinity, r.depth = $depth, r.validTo = null`,
        {
          userId: String(userId),
          characterId: String(characterId),
          affinity,
          depth,
          at,
        },
      );
    } catch (err) {
      logger.warn('[TemporalKG] relation write failed:', err.message);
    } finally {
      await session.close();
    }
  }

  try {
    await query(
      `INSERT INTO temporal_relations (
         user_id, character_id, affinity, depth, valid_from
       ) VALUES ($1, $2, $3, $4, $5)`,
      [userId, characterId, affinity, depth, at],
    );
  } catch (err) {
    logger.warn('[TemporalKG] relation pg skipped:', err.message);
  }

  return { ok: true };
}

/**
 * Retrieve context by chronological evolution + relational depth (not just vectors).
 */
export async function queryTemporalContext({
  userId,
  characterId,
  asOf = new Date().toISOString(),
  limit = 8,
  minDepth = 0,
}) {
  if (!ENABLED()) return { backend: 'disabled', memories: [], relation: null };

  const driver = getNeo4jDriver();
  if (driver) {
    const session = driver.session();
    try {
      const memResult = await session.run(
        `MATCH (c:Character {id: $characterId})-[r:REMEMBERS]->(m:Memory)
         WHERE r.validFrom <= datetime($asOf)
           AND (r.validTo IS NULL OR r.validTo > datetime($asOf))
           AND (m.validTo IS NULL OR m.validTo > datetime($asOf))
         OPTIONAL MATCH (m)-[:EVOLVED_INTO*0..3]->(tip:Memory)
         WITH m, tip, r
         ORDER BY coalesce(tip.validFrom, m.validFrom) DESC, r.importance DESC
         LIMIT $limit
         RETURN coalesce(tip.id, m.id) AS id,
                coalesce(tip.content, m.content) AS content,
                coalesce(tip.importance, m.importance) AS importance,
                toString(coalesce(tip.validFrom, m.validFrom)) AS validFrom`,
        {
          characterId: String(characterId),
          asOf,
          limit: Math.min(limit, 20),
        },
      );

      const relResult = await session.run(
        `MATCH (u:User {id: $userId})-[r:RELATES_TO]->(c:Character {id: $characterId})
         WHERE r.validFrom <= datetime($asOf)
           AND (r.validTo IS NULL OR r.validTo > datetime($asOf))
           AND r.depth >= $minDepth
         RETURN r.affinity AS affinity, r.depth AS depth, toString(r.validFrom) AS validFrom
         ORDER BY r.validFrom DESC LIMIT 1`,
        {
          userId: String(userId),
          characterId: String(characterId),
          asOf,
          minDepth,
        },
      );

      return {
        backend: 'neo4j',
        memories: memResult.records.map((rec) => ({
          id: rec.get('id'),
          content: rec.get('content'),
          importance: rec.get('importance'),
          validFrom: rec.get('validFrom'),
          source: 'temporal_kg',
        })),
        relation: relResult.records[0]
          ? {
              affinity: relResult.records[0].get('affinity'),
              depth: relResult.records[0].get('depth'),
              validFrom: relResult.records[0].get('validFrom'),
            }
          : null,
      };
    } catch (err) {
      logger.warn('[TemporalKG] neo4j query failed:', err.message);
    } finally {
      await session.close();
    }
  }

  return queryTemporalContextPostgres({ userId, characterId, asOf, limit, minDepth });
}

async function queryTemporalContextPostgres({ userId, characterId, asOf, limit, minDepth }) {
  let memories = [];
  let relation = null;

  try {
    const { rows } = await query(
      `SELECT id, content, importance, valid_from
       FROM temporal_memories
       WHERE character_id = $1
         AND valid_from <= $2::timestamptz
         AND (valid_to IS NULL OR valid_to > $2::timestamptz)
       ORDER BY valid_from DESC, importance DESC
       LIMIT $3`,
      [characterId, asOf, limit],
    );
    memories = rows.map((r) => ({
      id: r.id,
      content: r.content,
      importance: r.importance,
      validFrom: r.valid_from,
      source: 'temporal_kg_pg',
    }));
  } catch {
    memories = [];
  }

  try {
    const { rows } = await query(
      `SELECT affinity, depth, valid_from
       FROM temporal_relations
       WHERE user_id = $1 AND character_id = $2
         AND valid_from <= $3::timestamptz
         AND (valid_to IS NULL OR valid_to > $3::timestamptz)
         AND depth >= $4
       ORDER BY valid_from DESC LIMIT 1`,
      [userId, characterId, asOf, minDepth],
    );
    if (rows[0]) {
      relation = {
        affinity: rows[0].affinity,
        depth: rows[0].depth,
        validFrom: rows[0].valid_from,
      };
    }
  } catch {
    relation = null;
  }

  return { backend: 'postgres', memories, relation };
}

/**
 * Format temporal hits for prompt injection.
 */
export function formatTemporalPromptBlock(temporal) {
  if (!temporal?.memories?.length && !temporal?.relation) return null;
  const lines = ['Temporal knowledge (chronology + relational depth):'];
  if (temporal.relation) {
    lines.push(
      `Relationship depth=${temporal.relation.depth} affinity=${temporal.relation.affinity} since ${temporal.relation.validFrom}`,
    );
  }
  for (const m of temporal.memories ?? []) {
    lines.push(`- [${m.validFrom}] ${m.content}`);
  }
  return lines.join('\n');
}

export function getTemporalKgConfig() {
  return {
    enabled: ENABLED(),
    backend: getNeo4jDriver() ? 'neo4j' : 'postgres',
    schemaVersion: 'phase35-v1',
  };
}

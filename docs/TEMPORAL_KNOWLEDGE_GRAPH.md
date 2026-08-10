# Temporal Knowledge Graph (Phase 35)

Neo4j schema used by `temporalKnowledgeGraph.js` for chronology + relational-depth RAG.

## Constraints & indexes

```cypher
CREATE CONSTRAINT user_id IF NOT EXISTS FOR (u:User) REQUIRE u.id IS UNIQUE;
CREATE CONSTRAINT character_id IF NOT EXISTS FOR (c:Character) REQUIRE c.id IS UNIQUE;
CREATE CONSTRAINT memory_id IF NOT EXISTS FOR (m:Memory) REQUIRE m.id IS UNIQUE;
CREATE CONSTRAINT topic_name IF NOT EXISTS FOR (t:Topic) REQUIRE t.name IS UNIQUE;
CREATE INDEX memory_valid_from IF NOT EXISTS FOR (m:Memory) ON (m.validFrom);
CREATE INDEX relates_valid_from IF NOT EXISTS FOR ()-[r:RELATES_TO]-() ON (r.validFrom);
```

## Graph model

```
(:User {id})
  -[:RELATES_TO {affinity, depth, validFrom, validTo}]->
(:Character {id})
  -[:REMEMBERS {validFrom, validTo, importance}]->
(:Memory {id, content, importance, validFrom, validTo})
  -[:EVOLVED_INTO {at, reason}]-> (:Memory)
  -[:ABOUT]-> (:Topic {name})

(:Character)-[:INTERACTED {at, mode}]->(:User)
```

## Query pattern

At time `asOf`, walk `REMEMBERS` edges still open (`validTo IS NULL`), follow `EVOLVED_INTO` tips, and read the active `RELATES_TO` edge for relational depth — then merge with vector RAG in `ContextEngine`.

## Fallback

Without `NEO4J_URI`, Postgres tables `temporal_memories` / `temporal_relations` (migration `024`) provide the same temporal queries.

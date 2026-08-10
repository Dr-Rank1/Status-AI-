-- Phase 23: Self-healing, synthetic simulation, BCI intent events

CREATE TABLE IF NOT EXISTS self_healing_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  error_fingerprint TEXT NOT NULL,
  error_type TEXT NOT NULL,
  route_pattern TEXT,
  message TEXT,
  stack_preview TEXT,
  patch_id UUID,
  status TEXT NOT NULL DEFAULT 'detected',
  sandbox_result JSONB,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_self_healing_events_fingerprint ON self_healing_events (error_fingerprint);
CREATE INDEX IF NOT EXISTS idx_self_healing_events_status ON self_healing_events (status, created_at DESC);

CREATE TABLE IF NOT EXISTS self_healing_patches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_pattern TEXT NOT NULL,
  patch_type TEXT NOT NULL DEFAULT 'fallback_response',
  patch_config JSONB NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  test_passed BOOLEAN NOT NULL DEFAULT FALSE,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_self_healing_patches_route ON self_healing_patches (route_pattern, status);

CREATE TABLE IF NOT EXISTS synthetic_personas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  persona_key TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  traits JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS synthetic_simulation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_id TEXT NOT NULL,
  persona_count INT NOT NULL DEFAULT 0,
  interactions_count INT NOT NULL DEFAULT 0,
  drift_score NUMERIC(5, 3),
  guardrail_violations INT NOT NULL DEFAULT 0,
  fine_tuning_curated INT NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'running',
  summary JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_synthetic_runs_batch ON synthetic_simulation_runs (batch_id, created_at DESC);

CREATE TABLE IF NOT EXISTS synthetic_interactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id UUID REFERENCES synthetic_simulation_runs(id) ON DELETE CASCADE,
  persona_id UUID REFERENCES synthetic_personas(id) ON DELETE SET NULL,
  character_id UUID REFERENCES ai_characters(id) ON DELETE SET NULL,
  user_message TEXT NOT NULL,
  ai_reply TEXT,
  guardrail_flags JSONB NOT NULL DEFAULT '[]',
  drift_delta NUMERIC(5, 3),
  curated_for_training BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_synthetic_interactions_run ON synthetic_interactions (run_id);

CREATE TABLE IF NOT EXISTS bci_intent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  character_id UUID REFERENCES ai_characters(id) ON DELETE SET NULL,
  valence NUMERIC(4, 3) NOT NULL,
  arousal NUMERIC(4, 3) NOT NULL,
  focus_level NUMERIC(4, 3),
  intent_type TEXT NOT NULL,
  affinity_delta INT NOT NULL DEFAULT 0,
  ui_theme_hint JSONB NOT NULL DEFAULT '{}',
  processed_only BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bci_intent_user ON bci_intent_events (user_id, created_at DESC);

/**
 * Phase 36 — Bio-adaptive cognitive computing.
 * Combines BCI + biometric telemetry → LLM temperature, empathy, UI complexity.
 */

import { logger } from '../../utils/logger.js';

/**
 * Derive cognitive load / fatigue from BCI + biometrics.
 */
export function assessCognitiveState({
  bci = {},
  biometrics = {},
} = {}) {
  const arousal = num(bci.arousal, 0.4);
  const focus = num(bci.focusLevel ?? bci.focus_level, 0.5);
  const valence = num(bci.valence, 0);
  const stress = num(biometrics.stress ?? biometrics.voiceStress, 0.3);
  const heartRate = num(biometrics.heartRate ?? biometrics.hr, 70);
  const hrv = num(biometrics.hrv, 50);
  const blinkRate = num(biometrics.blinkRate, 15);

  const hrLoad = clamp((heartRate - 60) / 80, 0, 1);
  const fatigue = clamp(
    (1 - focus) * 0.35
      + stress * 0.3
      + (blinkRate > 25 ? 0.2 : 0)
      + (hrv < 30 ? 0.15 : 0)
      + hrLoad * 0.1,
    0,
    1,
  );
  const cognitiveLoad = clamp(
    arousal * 0.25 + (1 - focus) * 0.4 + stress * 0.25 + hrLoad * 0.1,
    0,
    1,
  );

  return {
    arousal,
    focus,
    valence,
    stress,
    fatigue,
    cognitiveLoad,
    highLoad: cognitiveLoad >= 0.65 || fatigue >= 0.7,
  };
}

/**
 * Modulate generation + UI parameters from cognitive state.
 */
export function modulateCognitiveControls(state, { baseTemperature = 0.75, baseEmpathy = 0.5 } = {}) {
  const load = state.cognitiveLoad;
  const fatigue = state.fatigue;

  // High load → cooler, more predictable LLM; raise empathy under stress
  const temperature = clamp(
    baseTemperature - load * 0.35 - fatigue * 0.15,
    0.2,
    1.2,
  );
  const empathy = clamp(
    baseEmpathy + state.stress * 0.35 + (state.valence < 0 ? 0.15 : 0),
    0,
    1,
  );
  const topP = clamp(0.95 - load * 0.25, 0.5, 0.95);

  // UI complexity: 1 = full chrome, 0 = extreme declutter
  const uiComplexity = clamp(1 - Math.max(load, fatigue) * 0.85, 0.15, 1);
  const declutter = uiComplexity < 0.55;
  const simplifyLayout = fatigue >= 0.6 || load >= 0.7;

  const edgeFilters = {
    reduceMotion: fatigue >= 0.55,
    reduceContrastNoise: load >= 0.6,
    hideSecondaryPanels: simplifyLayout,
    maxVisibleActions: simplifyLayout ? 3 : 8,
    fontScale: fatigue >= 0.65 ? 1.12 : 1.0,
  };

  const result = {
    llm: { temperature, topP, empathy },
    ui: {
      complexity: uiComplexity,
      declutter,
      simplifyLayout,
      edgeFilters,
    },
    state,
    engine: 'bio-adaptive/v1',
  };

  logger.info(
    `[BioCog] load=${load.toFixed(2)} fatigue=${fatigue.toFixed(2)} temp=${temperature.toFixed(2)} empathy=${empathy.toFixed(2)} declutter=${declutter}`,
  );

  return result;
}

export function applyBioAdaptiveToContext(context = {}, signals = {}) {
  const state = assessCognitiveState(signals);
  const controls = modulateCognitiveControls(state, {
    baseTemperature: context.baseTemperature,
    baseEmpathy: context.affectiveContext?.empathyLevel ?? 0.5,
  });

  return {
    ...context,
    bioCognitive: controls,
    bciIntent: {
      ...(context.bciIntent ?? {}),
      ...(signals.bci ?? {}),
    },
    affectiveContext: {
      ...(context.affectiveContext ?? {}),
      empathyLevel: controls.llm.empathy,
      bioAdaptive: true,
    },
  };
}

function num(v, fallback) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

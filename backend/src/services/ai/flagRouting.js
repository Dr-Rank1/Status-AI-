/**
 * Apply PostHog feature flags to LLM provider routing without redeploying.
 */

import { evaluateFlags, isFlagEnabled } from '../posthogService.js';

function hasProvider(provider) {
  switch (provider) {
    case 'anthropic':
      return Boolean(process.env.ANTHROPIC_API_KEY);
    case 'gemini':
      return Boolean(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY);
    case 'openai':
      return Boolean(process.env.OPENAI_API_KEY);
    default:
      return false;
  }
}

/**
 * Override static router decision based on evaluated PostHog flags.
 */
export function applyFlagRouting({ provider, reason, mode, flags }) {
  if (!flags || Object.keys(flags).length === 0) {
    return { provider, reason };
  }

  const dmModes = mode === 'dm' || mode === 'group_dm';
  const feedModes = mode === 'post_reply' || mode === 'autonomous_post' || mode === 'narrative_reaction';

  if (dmModes && isFlagEnabled(flags, 'force-anthropic-dm') && hasProvider('anthropic')) {
    return { provider: 'anthropic', reason: 'posthog_force_anthropic_dm' };
  }

  if (dmModes && isFlagEnabled(flags, 'force-gemini-dm') && hasProvider('gemini')) {
    return { provider: 'gemini', reason: 'posthog_force_gemini_dm' };
  }

  if (feedModes && isFlagEnabled(flags, 'force-gemini-feed') && hasProvider('gemini')) {
    return { provider: 'gemini', reason: 'posthog_force_gemini_feed' };
  }

  if (feedModes && isFlagEnabled(flags, 'force-anthropic-feed') && hasProvider('anthropic')) {
    return { provider: 'anthropic', reason: 'posthog_force_anthropic_feed' };
  }

  if (isFlagEnabled(flags, 'disable-ai-providers')) {
    return { provider: 'mock', reason: 'posthog_disable_ai' };
  }

  return { provider, reason };
}

/**
 * Evaluate flags for a user and return routing overrides + attribution properties.
 */
export async function resolveRoutingWithFlags({ userId, user, mode, baseRoute }) {
  const distinctId = userId ?? user?.id;
  if (!distinctId) {
    return { route: baseRoute, flagProperties: {} };
  }

  const personProperties = {
    username: user?.username,
    mode,
  };

  const { flags, properties } = await evaluateFlags(distinctId, personProperties);
  const overridden = applyFlagRouting({
    provider: baseRoute.provider,
    reason: baseRoute.reason,
    mode,
    flags,
  });

  return {
    route: { ...baseRoute, ...overridden },
    flagProperties: properties,
    flags,
  };
}

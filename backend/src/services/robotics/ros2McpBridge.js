/**
 * Phase 41 — ROS 2 MCP bridge for embodied robotics.
 * Maps MCP tool calls ↔ ROS 2 topics/services; folds lidar / depth into ContextEngine.
 */

import crypto from 'crypto';
import { logger } from '../../utils/logger.js';
import { AppError } from '../../utils/errors.js';
import { assertAgentsNotKilled } from '../security/globalKillSwitchService.js';
import { appendAuditEvent } from '../security/immutableAuditLedger.js';

const ROS_ENABLED = () => process.env.ROS2_MCP_ENABLED !== 'false';
const DEFAULT_NAMESPACE = process.env.ROS2_NAMESPACE ?? '/status_robot';

/** In-memory telemetry ring (edge-safe without ROS daemon). */
const telemetryRing = [];
const MAX_TELEMETRY = parseInt(process.env.ROS2_TELEMETRY_RING ?? '64', 10);

/** Pending actuation commands (published when ros2 bridge daemon is up). */
const commandQueue = [];

export const ROS2_TOPICS = {
  lidar: `${DEFAULT_NAMESPACE}/scan`,
  depth: `${DEFAULT_NAMESPACE}/depth/points`,
  cmdVel: `${DEFAULT_NAMESPACE}/cmd_vel`,
  embodiment: `${DEFAULT_NAMESPACE}/embodiment_state`,
};

/**
 * Ingest lidar scan (LaserScan-like) or depth cloud summary into ring buffer.
 */
export function ingestRos2Telemetry({
  kind = 'lidar',
  frameId = 'base_link',
  ranges = [],
  depthBuckets = [],
  pose = null,
  embodimentId = null,
  raw = null,
} = {}) {
  const entry = {
    id: crypto.randomUUID(),
    kind,
    frameId,
    at: new Date().toISOString(),
    ranges: Array.isArray(ranges) ? ranges.slice(0, 360) : [],
    depthBuckets: Array.isArray(depthBuckets) ? depthBuckets.slice(0, 64) : [],
    pose,
    embodimentId,
    summary: summarizeTelemetry(kind, ranges, depthBuckets, pose),
    rawHash: raw ? crypto.createHash('sha256').update(JSON.stringify(raw)).digest('hex').slice(0, 16) : null,
  };
  telemetryRing.unshift(entry);
  while (telemetryRing.length > MAX_TELEMETRY) telemetryRing.pop();
  logger.info(`[ROS2] telemetry ${kind} id=${entry.id.slice(0, 8)} ${entry.summary.slice(0, 80)}`);
  return entry;
}

function summarizeTelemetry(kind, ranges, depthBuckets, pose) {
  if (kind === 'lidar' && ranges.length) {
    const min = Math.min(...ranges.filter((r) => Number.isFinite(r) && r > 0));
    const avg = ranges.reduce((a, b) => a + (Number(b) || 0), 0) / ranges.length;
    return `lidar min=${min.toFixed?.(2) ?? min}m avg=${avg.toFixed(2)}m n=${ranges.length}`;
  }
  if (kind === 'depth' && depthBuckets.length) {
    return `depth buckets=${depthBuckets.length} near=${depthBuckets[0] ?? 0}`;
  }
  if (pose) {
    return `pose x=${pose.x ?? 0} y=${pose.y ?? 0} yaw=${pose.yaw ?? 0}`;
  }
  return `${kind} pulse`;
}

export function listRecentTelemetry({ limit = 8, kind = null } = {}) {
  return telemetryRing
    .filter((t) => !kind || t.kind === kind)
    .slice(0, limit);
}

/**
 * Format telemetry for ContextEngine prompt injection.
 */
export function formatRoboticsPromptBlock(entries = listRecentTelemetry({ limit: 5 })) {
  if (!entries.length) return '';
  return [
    'Embodied robotics telemetry (ROS 2):',
    ...entries.map((e) => `- [${e.kind}|${e.frameId}] ${e.summary}`),
  ].join('\n');
}

/**
 * Queue physical actuation (cmd_vel / gripper) — sandboxed; no real ROS publish unless bridge enabled.
 */
export async function queueRos2Actuation({
  command = 'stop',
  linear = { x: 0, y: 0, z: 0 },
  angular = { x: 0, y: 0, z: 0 },
  durationSec = 1,
  embodimentId = null,
  agentId = 'mcp',
} = {}) {
  assertAgentsNotKilled();
  if (!ROS_ENABLED()) {
    throw new AppError('ROS2 MCP bridge disabled', 503, 'ROS2_DISABLED');
  }

  // Safety clamps
  const clamp = (v, max = 0.5) => Math.max(-max, Math.min(max, Number(v) || 0));
  const cmd = {
    id: crypto.randomUUID(),
    command,
    twist: {
      linear: { x: clamp(linear.x), y: clamp(linear.y), z: clamp(linear.z, 0.2) },
      angular: { x: clamp(angular.x, 0.2), y: clamp(angular.y, 0.2), z: clamp(angular.z) },
    },
    durationSec: Math.min(5, Math.max(0.1, Number(durationSec) || 1)),
    embodimentId,
    agentId,
    topic: ROS2_TOPICS.cmdVel,
    status: process.env.ROS2_LIVE_PUBLISH === 'true' ? 'publish_pending' : 'queued_sandbox',
    at: new Date().toISOString(),
  };
  commandQueue.unshift(cmd);
  while (commandQueue.length > 32) commandQueue.pop();

  await appendAuditEvent({
    type: 'ros2.actuate',
    actor: agentId,
    action: command,
    decision: cmd.status,
    metadata: { id: cmd.id, embodimentId },
  });

  return cmd;
}

/**
 * Transition spatial avatar → physical embodiment binding.
 */
export function bindEmbodiment({
  avatarId,
  robotNamespace = DEFAULT_NAMESPACE,
  capabilities = ['lidar', 'depth', 'cmd_vel'],
} = {}) {
  return {
    bindingId: crypto.randomUUID(),
    avatarId,
    robotNamespace,
    topics: ROS2_TOPICS,
    capabilities,
    mode: 'physical',
    at: new Date().toISOString(),
  };
}

/**
 * MCP tool executor: ros2_publish_cmd / ros2_read_sensors / ros2_bind_embodiment
 */
export async function executeRos2McpTool(toolName, args = {}, ctx = {}) {
  switch (toolName) {
    case 'ros2_read_sensors': {
      if (args.ingest) {
        ingestRos2Telemetry(args.ingest);
      }
      const entries = listRecentTelemetry({
        limit: args.limit ?? 5,
        kind: args.kind ?? null,
      });
      return {
        success: true,
        topics: ROS2_TOPICS,
        telemetry: entries,
        promptBlock: formatRoboticsPromptBlock(entries),
      };
    }
    case 'ros2_publish_cmd':
      return {
        success: true,
        command: await queueRos2Actuation({ ...args, agentId: ctx.agentId ?? ctx.userId ?? 'mcp' }),
      };
    case 'ros2_bind_embodiment':
      return { success: true, binding: bindEmbodiment(args) };
    default:
      throw new Error(`Unknown ROS2 tool: ${toolName}`);
  }
}

export function getRos2BridgeConfig() {
  return {
    enabled: ROS_ENABLED(),
    livePublish: process.env.ROS2_LIVE_PUBLISH === 'true',
    namespace: DEFAULT_NAMESPACE,
    topics: ROS2_TOPICS,
    telemetryBuffered: telemetryRing.length,
    commandsQueued: commandQueue.length,
    protocol: 'ROS 2 Humble+/MCP 2026-07-28',
  };
}

export function peekCommandQueue() {
  return commandQueue.slice(0, 10);
}

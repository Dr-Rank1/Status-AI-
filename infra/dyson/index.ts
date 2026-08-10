/**
 * Phase 44 — Pulumi program: route pretrain to orbital when irradiance maximizes.
 * Preview/dry-run safe — emits stack outputs only (no live cloud mutations by default).
 */
import * as pulumi from '@pulumi/pulumi';

const cfg = new pulumi.Config();
const irradianceWm2 = cfg.getNumber('irradianceWm2') ?? 1200;
const irradianceMinWm2 = cfg.getNumber('irradianceMinWm2') ?? 950;
const workloadType = cfg.get('workloadType') ?? 'pretrain';

const gateOpen = irradianceWm2 >= irradianceMinWm2;
const target = gateOpen ? 'orbital-dyson-ring-1' : 'defer-ground-green';

export const pretrainTarget = target;
export const irradianceGateOpen = gateOpen;
export const workload = workloadType;
export const note =
  'Hypothetical Dyson orchestration — pair with POST /api/v2/devops/dyson/route';

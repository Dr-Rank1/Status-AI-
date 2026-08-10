import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import {
  photonicMatmul,
  photonicVectorSearch,
  photonicDecodeIntent,
  getPhotonicConfig,
} from '../src/services/photonic/photonicComputeService.js';
import {
  encodeBytesToDna,
  decodeDnaToBytes,
  reedSolomonEncode,
  reedSolomonDecode,
  archiveToMolecularStorage,
  retrieveMolecularArchive,
  getMolecularStorageConfig,
} from '../src/services/storage/molecularDnaEncoder.js';
import {
  compensateDoppler,
  selectOrbitalRoute,
  syncViaLeoMesh,
  getLeoMeshConfig,
} from '../src/services/network/leoOrbitalMeshRouter.js';
import {
  createContinuityCapsule,
  recoverAgentFromCapsule,
  runContinuityDaemonTick,
  markClusterHealth,
  resetContinuityState,
  getContinuityConfig,
} from '../src/services/continuity/interplanetaryContinuity.js';
import { startElection } from '../src/services/consensus/raftConsensusMesh.js';
import { releaseKillSwitch } from '../src/services/security/globalKillSwitchService.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

describe('Phase 42 — Photonic compute', () => {
  it('performs optical-class matmul and vector search', () => {
    const m = photonicMatmul(
      [
        [1, 2],
        [3, 4],
      ],
      [
        [5, 6],
        [7, 8],
      ],
    );
    assert.deepEqual(m.matrix, [
      [19, 22],
      [43, 50],
    ]);
    assert.ok(m.latencyNs < 1000);
    assert.ok(m.thermalMw < 1);

    const search = photonicVectorSearch([1, 0], [
      [1, 0],
      [0, 1],
      [0.7, 0.7],
    ]);
    assert.equal(search.index, 0);
    assert.ok(search.score > 0.9);

    const intent = photonicDecodeIntent([0.1, 0.9, 0.2]);
    assert.equal(intent.intentId, 1);
    assert.ok(getPhotonicConfig().nativePath.includes('photonic_compute_bridge'));
  });

  it('ships native C++ photonic bridge sources', () => {
    const header = path.join(root, 'mobile/native/photonic_compute_bridge/include/status_photonic.h');
    const src = path.join(root, 'mobile/native/photonic_compute_bridge/src/status_photonic.cpp');
    assert.ok(fs.existsSync(header));
    assert.ok(fs.existsSync(src));
    const text = fs.readFileSync(header, 'utf8');
    assert.ok(text.includes('status_photonic_matmul'));
  });
});

describe('Phase 42 — Molecular DNA archival', () => {
  it('round-trips DNA encoding and Reed-Solomon', () => {
    const payload = Buffer.from('temporal-kg-agent-ledger-v1', 'utf8');
    const dna = encodeBytesToDna(payload);
    assert.match(dna, /^[ACGT]+$/);
    const back = decodeDnaToBytes(dna);
    assert.ok(back.equals(payload));

    const rs = reedSolomonEncode(payload, 4, 2);
    const decoded = reedSolomonDecode(rs);
    assert.equal(decoded.integrityOk, true);
    assert.ok(decoded.payload.equals(payload));
    assert.ok(getMolecularStorageConfig().targetPersistenceYears >= 1000);
  });

  it('archives and retrieves molecular cold storage', async () => {
    const artifact = await archiveToMolecularStorage({
      label: 'test-ledger',
      records: [{ id: 1, content: 'multi-year memory' }],
      metadata: { phase: 42 },
    });
    assert.ok(artifact.dnaLength > 10);
    const got = await retrieveMolecularArchive(artifact.id);
    assert.equal(got.integrityOk, true);
    assert.equal(got.payload.label, 'test-ledger');
  });
});

describe('Phase 42 — LEO orbital mesh', () => {
  it('compensates doppler and selects routes', () => {
    const d = compensateDoppler({ frequencyHz: 20e9, radialVelocityKmS: 7 });
    assert.ok(Math.abs(d.shiftHz) > 0);
    const route = selectOrbitalRoute({ latDeg: 40, lonDeg: -74, preferMaritime: true });
    assert.ok(route.primary.startsWith('leo-'));
    assert.ok(route.doppler);
    assert.ok(getLeoMeshConfig().constellation.length >= 3);
    assert.ok(fs.existsSync(path.join(root, 'deploy/orbital/leo_mesh_router.yaml')));
  });

  it('syncs via LEO DTN mesh', async () => {
    startElection();
    const out = await syncViaLeoMesh({
      edgeNodeId: 'ship-1',
      payload: { swarm: 'ok' },
      latDeg: 10,
      lonDeg: -30,
      connected: true,
    });
    assert.ok(out.bundleId);
    assert.ok(out.route.primary);
  });
});

describe('Phase 42 — Interplanetary continuity', () => {
  before(() => {
    resetContinuityState();
  });

  it('creates capsule and recovers after cluster failure', async () => {
    await releaseKillSwitch({ by: 'test' });
    const { capsule } = await createContinuityCapsule({
      agentId: 'status.dialogue',
      state: { persona: 'nova', turn: 42 },
      memoryRecords: [{ content: 'remember the nebula' }],
    });
    assert.equal(capsule.custodial, false);
    assert.ok(capsule.stateCommitment);

    markClusterHealth('ground-primary', false);
    const recovered = await recoverAgentFromCapsule({
      capsuleId: capsule.capsuleId,
      preferredCluster: 'leo-relay',
    });
    assert.equal(recovered.node.status, 'reinstated');
    assert.ok(recovered.integrityOk);

    const tick = await runContinuityDaemonTick({ missingAgentIds: ['status.dialogue', 'missing-x'] });
    assert.ok(tick.actions.some((a) => a.agentId === 'status.dialogue'));
    assert.ok(getContinuityConfig().selfReplicating);
  });
});

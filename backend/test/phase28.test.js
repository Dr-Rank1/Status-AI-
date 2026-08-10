import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');

describe('Phase 28 — handoff artifacts', () => {
  it('ships operations runbook with required sections', () => {
    const md = readFileSync(join(root, 'OPERATIONS_RUNBOOK.md'), 'utf8');
    assert.match(md, /Incident response/i);
    assert.match(md, /Disaster recovery/i);
    assert.match(md, /AI persona reset/i);
    assert.match(md, /rotate_keys\.sh/);
  });

  it('ships exhaustive API reference covering private and websocket surfaces', () => {
    const md = readFileSync(join(root, 'API_REFERENCE.md'), 'utf8');
    assert.match(md, /\/auth\/login/);
    assert.match(md, /\/webhooks\/revenuecat/);
    assert.match(md, /WebSocket/);
    assert.match(md, /metaverse_voice_stream/);
    assert.match(md, /\/api\/v1\/public/);
  });

  it('ships key rotation utility and branch protection config', () => {
    assert.equal(existsSync(join(root, 'scripts/rotate_keys.sh')), true);
    assert.equal(existsSync(join(root, '.github/settings.yml')), true);
    const settings = readFileSync(join(root, '.github/settings.yml'), 'utf8');
    assert.match(settings, /required_approving_review_count:\s*2/);
    assert.match(settings, /enforce_admins:\s*true/);
  });

  it('ships formal handoff sign-off for Golden Master v1.0.0', () => {
    const md = readFileSync(join(root, 'HANDOFF_SIGN_OFF.md'), 'utf8');
    assert.match(md, /v1\.0\.0/);
    assert.match(md, /CLOSED/i);
    assert.match(md, /Golden Master/);
  });

  it('backend package is versioned 1.0.0', async () => {
    const pkg = JSON.parse(readFileSync(join(root, 'backend/package.json'), 'utf8'));
    assert.equal(pkg.version, '1.0.0');
  });
});

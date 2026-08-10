'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetchV2 } from '@/lib/api';

type ArchitectSnapshot = {
  generatedAt: string;
  canvas: string;
  killSwitch: { killed: boolean };
  multiversal: {
    universeCount: number;
    multiversalSpawnRatePerMin: number;
    avgEntropyDecay: number;
    crossRealityParadoxResolutions: number;
    running: number;
    universeList: Array<{
      id: string;
      name: string;
      entropy: number;
      paradoxResolutions: number;
      rules?: { c: number; G: number };
    }>;
  };
  entropy: { avgDecay: number; paradoxResolutions: number };
  akashic: { timelines: number; futureCache: number };
  realityCompiler: { recipes: number; blueprintOnly: boolean };
};

export default function ArchitectCanvasPage() {
  const [token, setToken] = useState('');
  const [data, setData] = useState<ArchitectSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (adminToken: string) => {
    if (!adminToken) return;
    setBusy(true);
    setError(null);
    try {
      const snap = await apiFetchV2<ArchitectSnapshot>('/ops/architect-canvas', {
        token: adminToken,
      });
      setData(snap);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Architect Canvas');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    const saved = typeof window !== 'undefined' ? localStorage.getItem('admin_token') ?? '' : '';
    setToken(saved);
    if (saved) void load(saved);
    const id = setInterval(() => {
      const t = localStorage.getItem('admin_token');
      if (t) void load(t);
    }, 7000);
    return () => clearInterval(id);
  }, [load]);

  async function spawnUniverse() {
    if (!token) return;
    setBusy(true);
    try {
      await apiFetchV2('/genesis/ex-nihilo/spawn', {
        token,
        method: 'POST',
        body: JSON.stringify({
          name: `canvas-${Date.now().toString(36)}`,
          dimensions: 4,
          physics: { thermodynamicEfficiency: 0.7 },
        }),
      });
      await load(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Spawn failed');
    } finally {
      setBusy(false);
    }
  }

  const m = data?.multiversal;
  const list = m?.universeList ?? [];

  return (
    <div>
      <h1>Architect&apos;s Canvas</h1>
      <p style={{ color: '#a1a1aa' }}>
        Omni-versal administration — multiversal spawn rates, entropy decay, and cross-reality
        paradox resolutions. Sandboxed ex-nihilo genesis only.
      </p>

      <div className="card">
        <label>Admin JWT</label>
        <input
          value={token}
          onChange={(e) => {
            setToken(e.target.value);
            localStorage.setItem('admin_token', e.target.value);
          }}
          placeholder="Paste admin bearer token"
        />
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <button type="button" onClick={() => load(token)} disabled={busy}>
            {busy ? 'Refreshing…' : 'Refresh canvas'}
          </button>
          <button type="button" onClick={() => void spawnUniverse()} disabled={busy}>
            Spawn universe
          </button>
        </div>
      </div>

      {error && (
        <div className="card" style={{ borderColor: '#b91c1c' }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {data && (
        <>
          <div className="card">
            <h2>Multiversal telemetry</h2>
            <p style={{ color: '#71717a', fontSize: '0.85rem' }}>
              {data.canvas} · {data.generatedAt}
              {data.killSwitch?.killed ? ' · KILL SWITCH ACTIVE' : ''}
            </p>
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                gap: '0.75rem',
              }}
            >
              <Metric label="Universes" value={m?.universeCount ?? list.length} />
              <Metric label="Spawn / min" value={m?.multiversalSpawnRatePerMin ?? 0} />
              <Metric label="Avg entropy" value={Number((data.entropy?.avgDecay ?? 0).toExponential(2))} />
              <Metric label="Paradox fixes" value={data.entropy?.paradoxResolutions ?? 0} />
              <Metric label="Akashic TLs" value={data.akashic?.timelines ?? 0} />
              <Metric label="Matter recipes" value={data.realityCompiler?.recipes ?? 0} />
            </div>
          </div>

          <div className="card">
            <h2>Active universes</h2>
            {list.length === 0 && <p style={{ color: '#a1a1aa' }}>No sandboxed universes yet.</p>}
            <ul>
              {list.map((u) => (
                <li key={u.id}>
                  <strong>{u.name}</strong> — entropy {u.entropy.toExponential?.(3) ?? u.entropy} ·
                  paradoxes {u.paradoxResolutions}
                  {u.rules?.c != null ? ` · c=${u.rules.c}` : ''}
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div style={{ background: '#18181b', padding: '0.75rem', borderRadius: 8 }}>
      <div style={{ color: '#a1a1aa', fontSize: '0.75rem' }}>{label}</div>
      <div style={{ fontSize: '1.25rem', fontWeight: 600 }}>{value}</div>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetchV2 } from '@/lib/api';

type GlobalBrainSnapshot = {
  generatedAt: string;
  entity: string;
  killSwitch: { killed: boolean; reason: string | null };
  sentience: {
    swarmAgents: number;
    entanglementPairs: number;
    continuityCapsules: number;
    leoConstellation: number;
    energySites: number;
  };
  regions: Record<string, number>;
  predictions: Array<{
    region: string;
    predictedLoad: number;
    urgency: number;
    reason: string;
  }>;
  macroTune: { tuned: boolean; dampening: number };
  governance: { policyVersion: string; framework: string };
  observability?: {
    handoffs?: Array<{ from: string; to: string; task?: string }>;
    allocations?: Array<{ agentId: string; task: string; status: string }>;
  };
};

export default function GlobalBrainPage() {
  const [token, setToken] = useState('');
  const [data, setData] = useState<GlobalBrainSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (adminToken: string) => {
    if (!adminToken) return;
    setBusy(true);
    setError(null);
    try {
      const snap = await apiFetchV2<GlobalBrainSnapshot>('/ops/global-brain', {
        token: adminToken,
      });
      setData(snap);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load Global Brain');
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
    }, 8000);
    return () => clearInterval(id);
  }, [load]);

  async function retune() {
    if (!token) return;
    setBusy(true);
    try {
      await apiFetchV2('/ops/global-brain/tune', {
        token,
        method: 'POST',
        body: JSON.stringify({
          signals: {
            maritime: { anomalyScore: 0.45, trafficGrowth: 0.1 },
            'na-east': { trafficGrowth: 0.2 },
          },
        }),
      });
      await load(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Tune failed');
    } finally {
      setBusy(false);
    }
  }

  const regions = data?.regions ? Object.entries(data.regions) : [];

  return (
    <div>
      <h1>Planetary Global Brain</h1>
      <p style={{ color: '#a1a1aa' }}>
        Aggregate swarm sentience, regional cognitive bandwidth, and macro heuristic tuning
        ahead of predicted traffic / anomaly spikes.
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
            {busy ? 'Refreshing…' : 'Refresh telemetry'}
          </button>
          <button type="button" onClick={() => void retune()} disabled={busy}>
            Macro retune
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
            <h2>Sentience pulse</h2>
            <p style={{ color: '#71717a', fontSize: '0.85rem' }}>
              {data.entity} · {data.generatedAt}
              {data.killSwitch?.killed ? ' · KILL SWITCH ACTIVE' : ''}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.75rem' }}>
              <Metric label="Swarm agents" value={data.sentience.swarmAgents} />
              <Metric label="Entangle pairs" value={data.sentience.entanglementPairs} />
              <Metric label="Continuity" value={data.sentience.continuityCapsules} />
              <Metric label="LEO sats" value={data.sentience.leoConstellation} />
              <Metric label="Energy sites" value={data.sentience.energySites} />
            </div>
          </div>

          <div className="card">
            <h2>Cognitive bandwidth by region</h2>
            <p style={{ color: '#a1a1aa' }}>
              Macro tune {data.macroTune?.tuned ? 'applied' : 'idle'} (dampen {data.macroTune?.dampening})
            </p>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {regions.map(([region, share]) => (
                <li key={region} style={{ marginBottom: '0.5rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>{region}</span>
                    <span>{(share * 100).toFixed(1)}%</span>
                  </div>
                  <div
                    style={{
                      height: 8,
                      background: '#27272a',
                      borderRadius: 4,
                      overflow: 'hidden',
                    }}
                  >
                    <div
                      style={{
                        width: `${Math.min(100, share * 100)}%`,
                        height: '100%',
                        background: '#38bdf8',
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          </div>

          <div className="card">
            <h2>Predicted spikes</h2>
            {(data.predictions ?? []).length === 0 && (
              <p style={{ color: '#a1a1aa' }}>No urgent regional predictions.</p>
            )}
            <ul>
              {(data.predictions ?? []).map((p) => (
                <li key={`${p.region}-${p.reason}`}>
                  <strong>{p.region}</strong> — load {p.predictedLoad} · urgency {p.urgency} · {p.reason}
                </li>
              ))}
            </ul>
          </div>

          <div className="card">
            <h2>Recent macro allocations</h2>
            <ul>
              {(data.observability?.allocations ?? []).slice(0, 8).map((a, i) => (
                <li key={`${a.agentId}-${i}`}>
                  {a.agentId}: {a.task} ({a.status})
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div style={{ background: '#18181b', padding: '0.75rem', borderRadius: 8 }}>
      <div style={{ color: '#a1a1aa', fontSize: '0.75rem' }}>{label}</div>
      <div style={{ fontSize: '1.4rem', fontWeight: 600 }}>{value}</div>
    </div>
  );
}

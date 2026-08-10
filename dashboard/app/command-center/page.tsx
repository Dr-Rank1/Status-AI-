'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetchV2 } from '@/lib/api';

type CommandCenterSnapshot = {
  generatedAt: string;
  killSwitch: {
    killed: boolean;
    reason: string | null;
    killedAt: string | null;
    escrowFrozen: boolean;
  };
  governance: { policyVersion: string; framework: string; ruleCount: number };
  swarm: {
    cards: Array<{ agentId: string; role: string; enterprise: boolean; capabilities: number }>;
    a2a: { registered: number };
  };
  observability: {
    handoffs: Array<{ from: string; to: string; task?: string; at: string }>;
    allocations: Array<{ agentId: string; task: string; status: string; at: string }>;
    conflicts: Array<{ agents: string[]; reason: string; resolution?: string; at: string }>;
    tokenExpenditure: {
      txCount: number;
      totalVolume: number;
      tokenVelocity: number;
      edges: Record<string, number>;
    };
  };
  audit: {
    tip: { lastHash: string; memoryLength: number };
    recent: Array<{ event_type?: string; type?: string; actor: string; action?: string; decision?: string; created_at?: string; at?: string }>;
  };
};

export default function CommandCenterPage() {
  const [token, setToken] = useState('');
  const [data, setData] = useState<CommandCenterSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (adminToken: string) => {
    if (!adminToken) return;
    setBusy(true);
    setError(null);
    try {
      const snap = await apiFetchV2<CommandCenterSnapshot>('/ops/command-center', {
        token: adminToken,
      });
      setData(snap);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load command center');
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
    }, 6000);
    return () => clearInterval(id);
  }, [load]);

  async function toggleKill(engage: boolean) {
    if (!token) return;
    if (engage && !window.confirm('Engage global kill switch? This halts all agents and freezes escrow.')) {
      return;
    }
    setBusy(true);
    try {
      await apiFetchV2('/ops/kill-switch', {
        token,
        method: 'POST',
        body: JSON.stringify(engage ? { engage: true, reason: 'dashboard_kill_switch' } : { action: 'release' }),
      });
      await load(token);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Kill switch failed');
    } finally {
      setBusy(false);
    }
  }

  const killed = data?.killSwitch?.killed;

  return (
    <div>
      <h1>Agentic Command Center</h1>
      <p style={{ color: '#a1a1aa' }}>
        Unified control plane — handoffs, allocation, conflicts, token spend, governance, and kill switch.
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
            {busy ? 'Refreshing…' : 'Refresh'}
          </button>
          <button
            type="button"
            onClick={() => toggleKill(true)}
            disabled={busy || killed}
            style={{ background: '#b91c1c' }}
          >
            Global Kill Switch
          </button>
          <button
            type="button"
            onClick={() => toggleKill(false)}
            disabled={busy || !killed}
            style={{ background: '#15803d' }}
          >
            Release Kill Switch
          </button>
        </div>
        {error && <p style={{ color: '#f87171' }}>{error}</p>}
        {killed && (
          <p style={{ color: '#fbbf24', marginTop: '0.75rem' }}>
            KILL SWITCH ACTIVE — {data?.killSwitch.reason} (escrow frozen)
          </p>
        )}
      </div>

      {data && (
        <>
          <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
            <Metric label="Agents" value={String(data.swarm.cards.length)} />
            <Metric label="Token volume (24h)" value={String(data.observability.tokenExpenditure.totalVolume)} />
            <Metric label="Velocity / hr" value={data.observability.tokenExpenditure.tokenVelocity.toFixed(2)} />
            <Metric label="Policy" value={data.governance.policyVersion} />
          </div>

          <div className="card">
            <h2>Swarm roster</h2>
            <table>
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Role</th>
                  <th>Caps</th>
                  <th>Type</th>
                </tr>
              </thead>
              <tbody>
                {data.swarm.cards.map((c) => (
                  <tr key={c.agentId}>
                    <td><code>{c.agentId}</code></td>
                    <td>{c.role}</td>
                    <td>{c.capabilities}</td>
                    <td>{c.enterprise ? 'enterprise' : 'local'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2>Agent handoffs</h2>
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>From → To</th>
                  <th>Task</th>
                </tr>
              </thead>
              <tbody>
                {data.observability.handoffs.length === 0 && (
                  <tr><td colSpan={3}>No handoffs yet</td></tr>
                )}
                {data.observability.handoffs.map((h, i) => (
                  <tr key={`${h.at}-${i}`}>
                    <td>{new Date(h.at).toLocaleString()}</td>
                    <td>{h.from} → {h.to}</td>
                    <td>{(h.task ?? '').slice(0, 80)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2>Task allocation</h2>
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Agent</th>
                  <th>Status</th>
                  <th>Task</th>
                </tr>
              </thead>
              <tbody>
                {data.observability.allocations.map((a, i) => (
                  <tr key={`${a.at}-${i}`}>
                    <td>{new Date(a.at).toLocaleString()}</td>
                    <td><code>{a.agentId}</code></td>
                    <td>{a.status}</td>
                    <td>{(a.task ?? '').slice(0, 80)}</td>
                  </tr>
                ))}
                {data.observability.allocations.length === 0 && (
                  <tr><td colSpan={4}>No allocations yet</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2>Conflict resolution</h2>
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Agents</th>
                  <th>Reason</th>
                  <th>Resolution</th>
                </tr>
              </thead>
              <tbody>
                {data.observability.conflicts.length === 0 && (
                  <tr><td colSpan={4}>No conflicts recorded</td></tr>
                )}
                {data.observability.conflicts.map((c, i) => (
                  <tr key={`${c.at}-${i}`}>
                    <td>{new Date(c.at).toLocaleString()}</td>
                    <td>{c.agents.join(', ')}</td>
                    <td>{c.reason}</td>
                    <td>{c.resolution ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2>Token expenditure edges</h2>
            <table>
              <thead>
                <tr><th>Route</th><th>Tokens</th></tr>
              </thead>
              <tbody>
                {Object.entries(data.observability.tokenExpenditure.edges).map(([edge, vol]) => (
                  <tr key={edge}>
                    <td><code>{edge}</code></td>
                    <td>{vol}</td>
                  </tr>
                ))}
                {Object.keys(data.observability.tokenExpenditure.edges).length === 0 && (
                  <tr><td colSpan={2}>No micro-transactions in window</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2>Immutable audit tip</h2>
            <p style={{ color: '#a1a1aa', fontSize: '0.85rem' }}>
              chain length={data.audit.tip.memoryLength} · <code>{data.audit.tip.lastHash.slice(0, 24)}…</code>
            </p>
            <table>
              <thead>
                <tr>
                  <th>Type</th>
                  <th>Actor</th>
                  <th>Decision</th>
                </tr>
              </thead>
              <tbody>
                {data.audit.recent.slice(0, 12).map((e, i) => (
                  <tr key={i}>
                    <td>{e.event_type ?? e.type}</td>
                    <td>{e.actor}</td>
                    <td>{e.decision ?? e.action ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <p style={{ color: '#71717a', fontSize: '0.8rem' }}>
            Updated {new Date(data.generatedAt).toLocaleString()} · NIST {data.governance.framework} · {data.governance.ruleCount} rules
          </p>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ color: '#a1a1aa', fontSize: '0.85rem' }}>{label}</div>
      <strong style={{ fontSize: '1.35rem' }}>{value}</strong>
    </div>
  );
}

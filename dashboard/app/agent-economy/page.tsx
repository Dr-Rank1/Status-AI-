'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetchV2 } from '@/lib/api';

type EconomySnapshot = {
  sinceHours: number;
  txCount: number;
  totalVolume: number;
  tokenVelocity: number;
  edges: Record<string, number>;
  recent: Array<{
    id: string;
    payer_role: string;
    payee_role: string;
    amount: number;
    currency: string;
    method: string;
    created_at: string;
  }>;
  prices?: Record<string, { amount: number; currency: string; payeeRole: string }>;
};

export default function AgentEconomyPage() {
  const [token, setToken] = useState('');
  const [data, setData] = useState<EconomySnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (adminToken: string) => {
    if (!adminToken) return;
    setLoading(true);
    setError(null);
    try {
      const snap = await apiFetchV2<EconomySnapshot>('/ops/economy?sinceHours=24', {
        token: adminToken,
      });
      setData(snap);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load economy');
    } finally {
      setLoading(false);
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

  return (
    <div>
      <h1>Agent Economy</h1>
      <p style={{ color: '#a1a1aa' }}>
        Real-time MCP HTTP 402 micro-ledger — token velocity between autonomous swarms.
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
        <button type="button" onClick={() => load(token)} disabled={loading}>
          {loading ? 'Refreshing…' : 'Refresh ledger'}
        </button>
        {error && <p style={{ color: '#f87171' }}>{error}</p>}
      </div>

      {data && (
        <>
          <div className="card" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
            <div>
              <div style={{ color: '#a1a1aa', fontSize: '0.85rem' }}>Tx (24h)</div>
              <strong style={{ fontSize: '1.5rem' }}>{data.txCount}</strong>
            </div>
            <div>
              <div style={{ color: '#a1a1aa', fontSize: '0.85rem' }}>Volume</div>
              <strong style={{ fontSize: '1.5rem' }}>{data.totalVolume}</strong>
            </div>
            <div>
              <div style={{ color: '#a1a1aa', fontSize: '0.85rem' }}>Velocity / hr</div>
              <strong style={{ fontSize: '1.5rem' }}>{data.tokenVelocity.toFixed(2)}</strong>
            </div>
          </div>

          <div className="card">
            <h2>Swarm edges</h2>
            <table>
              <thead>
                <tr>
                  <th>Route</th>
                  <th>Tokens</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(data.edges).map(([edge, vol]) => (
                  <tr key={edge}>
                    <td><code>{edge}</code></td>
                    <td>{vol}</td>
                  </tr>
                ))}
                {Object.keys(data.edges).length === 0 && (
                  <tr><td colSpan={2}>No micro-transactions yet</td></tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="card">
            <h2>Recent ledger</h2>
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Payer → Payee</th>
                  <th>Method</th>
                  <th>Amount</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((row) => (
                  <tr key={row.id}>
                    <td>{new Date(row.created_at).toLocaleString()}</td>
                    <td>{row.payer_role} → {row.payee_role}</td>
                    <td><code>{row.method}</code></td>
                    <td>{row.amount} {row.currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

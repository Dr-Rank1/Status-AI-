'use client';

import { FormEvent, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

type Character = {
  id: string;
  name: string;
  handle: string;
  personality: { system_prompt?: string; tone?: string };
};

export default function CharactersPage() {
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selected, setSelected] = useState<Character | null>(null);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('admin_token') ?? '';
    if (!token) return;
    apiFetch<Character[]>('/tenant/admin/characters', { token })
      .then(setCharacters)
      .catch(() => setMessage('Load failed — set admin token on Theme page first'));
  }, []);

  async function onSave(e: FormEvent) {
    e.preventDefault();
    if (!selected) return;
    const token = localStorage.getItem('admin_token') ?? '';
    await apiFetch(`/tenant/admin/characters/${selected.id}/prompt`, {
      method: 'PATCH',
      token,
      body: JSON.stringify({ systemPrompt }),
    });
    setMessage(`Updated ${selected.name}`);
  }

  return (
    <div>
      <h1>AI Character Prompt Tuning</h1>
      <div className="card">
        <label>Select character</label>
        <select
          onChange={(e) => {
            const c = characters.find((x) => x.id === e.target.value) ?? null;
            setSelected(c);
            setSystemPrompt(c?.personality?.system_prompt ?? '');
          }}
        >
          <option value="">—</option>
          {characters.map((c) => (
            <option key={c.id} value={c.id}>{c.name} (@{c.handle})</option>
          ))}
        </select>
      </div>
      {selected && (
        <form className="card" onSubmit={onSave}>
          <label>System prompt for {selected.name}</label>
          <textarea rows={8} value={systemPrompt} onChange={(e) => setSystemPrompt(e.target.value)} />
          <button type="submit">Save prompt</button>
        </form>
      )}
      {message && <p style={{ color: '#22d3ee' }}>{message}</p>}
    </div>
  );
}

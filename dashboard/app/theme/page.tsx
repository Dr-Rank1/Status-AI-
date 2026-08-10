'use client';

import { FormEvent, useState } from 'react';
import { apiFetch } from '@/lib/api';

export default function ThemePage() {
  const [appName, setAppName] = useState('Status');
  const [primaryColor, setPrimaryColor] = useState('#8B5CF6');
  const [accentColor, setAccentColor] = useState('#22D3EE');
  const [backgroundColor, setBackgroundColor] = useState('#0A0A0B');
  const [message, setMessage] = useState('');

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const token = localStorage.getItem('admin_token') ?? prompt('Admin JWT token') ?? '';
    if (token) localStorage.setItem('admin_token', token);

    try {
      await apiFetch('/tenant/theme', {
        method: 'PATCH',
        token,
        body: JSON.stringify({ appName, primaryColor, accentColor, backgroundColor }),
      });
      setMessage('Theme saved — Flutter clients fetch on next startup.');
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'Save failed');
    }
  }

  return (
    <div>
      <h1>Theme Customization</h1>
      <form className="card" onSubmit={onSubmit}>
        <label>App name</label>
        <input value={appName} onChange={(e) => setAppName(e.target.value)} />
        <label>Primary color</label>
        <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} />
        <label>Accent color</label>
        <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)} />
        <label>Background color</label>
        <input type="color" value={backgroundColor} onChange={(e) => setBackgroundColor(e.target.value)} />
        <button type="submit">Save theme</button>
        {message && <p style={{ marginTop: '1rem', color: '#22d3ee' }}>{message}</p>}
      </form>
    </div>
  );
}

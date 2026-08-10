'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';

type User = {
  id: string;
  username: string;
  email: string;
  display_name: string;
  reputation: number;
  is_admin: boolean;
};

export default function ModerationPage() {
  const [users, setUsers] = useState<User[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = localStorage.getItem('admin_token') ?? '';
    if (!token) return;
    apiFetch<User[]>('/tenant/admin/users', { token }).then(setUsers).catch(() => {});
  }, []);

  async function moderate(userId: string, action: string) {
    const token = localStorage.getItem('admin_token') ?? '';
    await apiFetch(`/tenant/admin/users/${userId}/moderate`, {
      method: 'POST',
      token,
      body: JSON.stringify({ action }),
    });
    setMessage(`Applied ${action} to user`);
    setUsers(await apiFetch<User[]>('/tenant/admin/users', { token }));
  }

  return (
    <div>
      <h1>User Moderation</h1>
      <div className="card">
        <table>
          <thead>
            <tr><th>User</th><th>Email</th><th>Rep</th><th>Admin</th><th>Actions</th></tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id}>
                <td>{u.display_name} (@{u.username})</td>
                <td>{u.email}</td>
                <td>{u.reputation}</td>
                <td>{u.is_admin ? 'Yes' : 'No'}</td>
                <td>
                  {!u.is_admin && (
                    <button type="button" onClick={() => moderate(u.id, 'promote_admin')}>Promote</button>
                  )}
                  {u.is_admin && (
                    <button type="button" onClick={() => moderate(u.id, 'revoke_admin')}>Revoke</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {message && <p style={{ color: '#22d3ee' }}>{message}</p>}
    </div>
  );
}

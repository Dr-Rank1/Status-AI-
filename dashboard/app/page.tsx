import Link from 'next/link';

export default function HomePage() {
  return (
    <div>
      <h1>Tenant Administration</h1>
      <p style={{ color: '#a1a1aa' }}>
        Manage your white-label Status deployment — theme, AI characters, and user moderation.
      </p>
      <div className="card">
        <h2>Quick links</h2>
        <ul>
          <li><Link href="/theme">Customize branding & colors</Link></li>
          <li><Link href="/characters">Tune AI character prompts</Link></li>
          <li><Link href="/moderation">Moderate users</Link></li>
        </ul>
      </div>
      <div className="card">
        <h3>Environment</h3>
        <p>Tenant: <code>{process.env.NEXT_PUBLIC_TENANT_SLUG ?? 'default'}</code></p>
        <p>API: <code>{process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3000/api/v1'}</code></p>
      </div>
    </div>
  );
}

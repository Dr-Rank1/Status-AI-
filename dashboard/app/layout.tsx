import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Status Tenant Admin',
  description: 'White-label tenant administration dashboard',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <strong>Status Admin</strong>
          <a href="/">Overview</a>
          <a href="/theme">Theme</a>
          <a href="/characters">Characters</a>
          <a href="/moderation">Moderation</a>
          <a href="/agent-economy">Agent Economy</a>
          <a href="/command-center">Command Center</a>
        </nav>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}

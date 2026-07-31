'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useGraph } from '@/lib/useGraph';
import { relativeTime, useNow } from '@/lib/time';

const NAV = [
  { href: '/', label: 'Graph', key: 'g' },
  { href: '/signals', label: 'Signals', key: 's' },
  { href: '/import', label: 'Import', key: 'i' },
];

export function TopBar() {
  const pathname = usePathname();
  const { graph, heartbeat, lastSyncAt, backendAvailable, mock } = useGraph();
  const now = useNow();
  const [pulse, setPulse] = useState(false);

  useEffect(() => {
    setPulse(true);
    const timer = window.setTimeout(() => setPulse(false), 400);
    return () => window.clearTimeout(timer);
  }, [heartbeat]);

  return (
    <header className="topbar">
      <Link className="brand" href={mock ? '/?mock=1' : '/'} aria-label="Athena home">
        <span className="brand-dot" />
        <span className="wordmark">ATHENA</span>
        <span className="tagline">second brain for a project</span>
      </Link>
      <nav className="nav" aria-label="Primary navigation">
        {NAV.map((item) => (
          <Link
            href={`${item.href}${mock ? '?mock=1' : ''}`}
            className={pathname === item.href ? 'nav-link active' : 'nav-link'}
            key={item.href}
          >
            {item.label} <kbd>{item.key}</kbd>
          </Link>
        ))}
      </nav>
      <div className="system-strip" aria-live="polite">
        <span
          className={`heartbeat ${pulse ? 'pulse' : ''} ${backendAvailable || mock ? '' : 'offline'}`}
          title={backendAvailable ? 'Live API connected' : mock ? 'Mock graph active' : 'Using last good graph'}
        />
        <span>{graph.nodes.length}n</span>
        <span className="system-separator">·</span>
        <span>{graph.edges.length}e</span>
        <span className="system-separator">·</span>
        <span>{mock ? 'mock' : backendAvailable ? `synced ${relativeTime(new Date(lastSyncAt).toISOString(), now)}` : 'fixture fallback'}</span>
      </div>
    </header>
  );
}

export function ShortcutLayer() {
  const router = useRouter();
  const { mock, select } = useGraph();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const typing =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;
      if (typing) return;
      const suffix = mock ? '?mock=1' : '';
      if (event.key === 'g') router.push(`/${suffix}`);
      if (event.key === 's') router.push(`/signals${suffix}`);
      if (event.key === 'i') router.push(`/import${suffix}`);
      if (event.key === 'Escape') select(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mock, router, select]);
  return null;
}

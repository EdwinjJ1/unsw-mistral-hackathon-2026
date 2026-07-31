'use client';

import { useEffect, useState } from 'react';

export type Freshness = 'live' | 'fresh' | 'aging' | 'stale';

export function freshness(iso: string, now = Date.now()): Freshness {
  const minutes = (now - Date.parse(iso)) / 60_000;
  return minutes < 2 ? 'live' : minutes < 360 ? 'fresh' : minutes < 1_440 ? 'aging' : 'stale';
}

export function relativeTime(iso: string, now = Date.now()) {
  const seconds = Math.max(0, Math.round((now - Date.parse(iso)) / 1_000));
  if (seconds < 10) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function useNow(ms = 1_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), ms);
    return () => window.clearInterval(timer);
  }, [ms]);
  return now;
}

export function formatDue(iso?: string) {
  if (!iso) return 'no due date';
  return new Intl.DateTimeFormat('en-AU', { month: 'short', day: 'numeric' }).format(
    new Date(`${iso}T12:00:00`),
  );
}

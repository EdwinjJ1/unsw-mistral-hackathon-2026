'use client';

import { useEffect, useRef, useState } from 'react';
import { freshness, relativeTime, useNow } from '@/lib/time';
import { STATUS_COLOR, STATUS_GLYPH } from '@/lib/theme';
import type { SourceRef, Status } from '@/lib/types';

const STATUS_LABEL: Record<Status, string> = {
  done: 'done',
  in_progress: 'in progress',
  at_risk: 'at risk',
  blocked: 'blocked',
  not_started: 'not started',
};

export function StatusPill({ status = 'not_started' }: { status?: Status }) {
  const color = STATUS_COLOR[status];
  return (
    <span
      className="status-pill"
      style={{
        color,
        borderColor: `${color}61`,
        background: `${color}24`,
      }}
    >
      <span aria-hidden>{STATUS_GLYPH[status]}</span>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function FreshnessChip({ at }: { at: string }) {
  const now = useNow(10_000);
  const state = freshness(at, now);
  return (
    <span className={`freshness freshness-${state}`} title={new Date(at).toLocaleString()}>
      {state === 'live' && <span className="fresh-dot filled" />}
      {state === 'aging' && <span className="fresh-dot" />}
      {state === 'stale' && <span aria-hidden>!</span>}
      {relativeTime(at, now)}
    </span>
  );
}

function sourceLabel(source: SourceRef) {
  if (source.kind === 'discord_dm') return 'DM';
  if (source.kind === 'document') return 'DOC';
  return 'SEED';
}

function sourceLongLabel(source: SourceRef) {
  if (source.kind === 'discord_dm') return 'via Discord DM';
  if (source.kind === 'document') return 'via document';
  return 'via seed data';
}

export function SourceBadge({
  source,
  at,
  align = 'right',
}: {
  source?: SourceRef;
  at?: string;
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (event: PointerEvent) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', key);
    };
  }, [open]);

  if (!source) return <span className="unsourced">unsourced</span>;
  return (
    <span className="source-wrapper" ref={wrapper}>
      <button
        type="button"
        className="source-badge"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        {sourceLabel(source)}
      </button>
      {open && (
        <span className={`source-popover align-${align}`} role="dialog" aria-label="Source detail">
          <span className="source-popover-top">
            <span className="source-badge static">{sourceLabel(source)}</span>
            <span className="source-ref">{source.ref}</span>
          </span>
          <span className="source-quote">
            {source.quote ? `“${source.quote}”` : 'No verbatim excerpt was recorded.'}
          </span>
          <span className="source-via">
            {sourceLongLabel(source)}
            {at ? ` · ${new Date(at).toLocaleString()}` : ''}
          </span>
        </span>
      )}
    </span>
  );
}

const AVATAR_COLORS = ['#5E6AD2', '#2D8C7F', '#9367C7', '#B46B4C', '#4777A8', '#7B8050'];

export function Avatar({ id, label }: { id: string; label: string }) {
  const hash = [...id].reduce((total, char) => total + char.charCodeAt(0), 0);
  const initials = label
    .split(/\s+/)
    .map((part) => part[0])
    .slice(0, 2)
    .join('');
  return (
    <span className="avatar" style={{ background: AVATAR_COLORS[hash % AVATAR_COLORS.length] }}>
      {initials}
    </span>
  );
}

export function SectionTitle({
  children,
  count,
}: {
  children: React.ReactNode;
  count?: number;
}) {
  return (
    <div className="section-heading">
      <h2 className="eyebrow">{children}</h2>
      {typeof count === 'number' && <span className="meta">{count}</span>}
    </div>
  );
}

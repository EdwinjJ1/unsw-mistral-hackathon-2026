'use client';

import { useEffect, useMemo, useState } from 'react';
import { teamForNode } from '@/lib/derive';
import { STATUS_COLOR, STATUS_GLYPH } from '@/lib/theme';
import type { Status } from '@/lib/types';
import { useGraph } from '@/lib/useGraph';

const TEAM_POSITION: Record<string, { x: number; y: number }> = {
  'team.engineering': { x: 390, y: 275 },
  'team.product': { x: 190, y: 165 },
  'team.design': { x: 175, y: 470 },
  'team.legal-ops': { x: 550, y: 480 },
};

const FALLBACK_POSITIONS = [
  { x: 280, y: 180 },
  { x: 480, y: 190 },
  { x: 240, y: 440 },
  { x: 500, y: 450 },
];

export function NeuronGraph() {
  const {
    graph,
    selectedId,
    select,
    highlightIds,
    isRecent,
  } = useGraph();
  const teams = graph.nodes.filter((node) => node.type === 'Team');
  const positions = useMemo(
    () =>
      new Map(
        teams.map((team, index) => [
          team.id,
          TEAM_POSITION[team.id] ?? FALLBACK_POSITIONS[index % FALLBACK_POSITIONS.length],
        ]),
      ),
    [teams],
  );

  const teamEdges = useMemo(() => {
    const seen = new Set<string>();
    return [...graph.edges]
      .sort((a, b) =>
        a.type === b.type
          ? 0
          : a.type === 'CONFLICTS_WITH'
            ? -1
            : b.type === 'CONFLICTS_WITH'
              ? 1
              : 0,
      )
      .flatMap((edge) => {
        const from = teamForNode(graph, edge.from);
        const to = teamForNode(graph, edge.to);
        if (!from || !to || from.id === to.id) return [];
        const key = [from.id, to.id].sort().join('--');
        if (seen.has(key)) return [];
        seen.add(key);
        return [{ edge, from, to }];
      });
  }, [graph]);

  return (
    <div className={`graph-canvas ${selectedId ? 'has-selection' : ''}`}>
      <div className="graph-label">
        <span className="eyebrow">Live project graph</span>
        <span className="meta">select a team to inspect its source trail</span>
      </div>
      <svg
        className="graph-svg"
        viewBox="0 0 760 650"
        role="img"
        aria-label="Interactive project knowledge graph"
        preserveAspectRatio="xMidYMid meet"
      >
        <defs>
          <filter id="node-glow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="12" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="pulse-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="8" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g className="graph-scene">
          {teamEdges.map(({ edge, from, to }) => {
            const a = positions.get(from.id);
            const b = positions.get(to.id);
            if (!a || !b) return null;
            const conflict = edge.type === 'CONFLICTS_WITH';
            return (
              <g key={edge.id} className={highlightIds.has(edge.id) ? 'edge-highlighted' : ''}>
                <line
                  className={conflict ? 'graph-edge conflict' : 'graph-edge'}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                />
                <line
                  className="graph-particle-path"
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                />
              </g>
            );
          })}
          {teams.flatMap((team, teamIndex) => {
            const center = positions.get(team.id);
            if (!center) return [];
            const children = graph.nodes
              .filter((node) => node.teamId === team.id && node.type !== 'Person')
              .slice(0, 4);
            return children.map((child, index) => {
              const angle = (index / Math.max(3, children.length)) * Math.PI * 2 + teamIndex * 0.7;
              const radius = 72 + (index % 2) * 18;
              const x = center.x + Math.cos(angle) * radius;
              const y = center.y + Math.sin(angle) * radius;
              return (
                <g key={child.id} className="satellite">
                  <line x1={center.x} y1={center.y} x2={x} y2={y} />
                  <circle
                    cx={x}
                    cy={y}
                    r={child.type === 'Blocker' ? 7 : 5}
                    fill={STATUS_COLOR[child.status ?? 'not_started']}
                    className={isRecent(child.id) ? 'recent-node' : ''}
                  />
                </g>
              );
            });
          })}
          {teams.map((team, index) => {
            const point = positions.get(team.id) ?? FALLBACK_POSITIONS[index];
            const workload = graph.nodes.filter(
              (node) => node.teamId === team.id && node.type === 'Task',
            ).length;
            const radius = 23 + Math.min(8, workload * 2);
            const status = team.status ?? 'not_started';
            const selected = selectedId === team.id;
            const highlighted = highlightIds.size === 0 || highlightIds.has(team.id);
            return (
              <g
                key={team.id}
                className={`team-node ${selected ? 'selected' : ''} ${highlighted ? '' : 'dimmed'}`}
                role="button"
                tabIndex={0}
                aria-label={`Open ${team.label} team detail`}
                onClick={() => select(team.id)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') select(team.id);
                }}
              >
                {isRecent(team.id) && (
                  <circle
                    className="team-pulse"
                    cx={point.x}
                    cy={point.y}
                    r={radius + 16}
                    filter="url(#pulse-glow)"
                  />
                )}
                <circle
                  className="team-halo"
                  cx={point.x}
                  cy={point.y}
                  r={radius + 12}
                  fill={STATUS_COLOR[status]}
                  filter="url(#node-glow)"
                />
                {selected && (
                  <circle
                    className="selection-ring"
                    cx={point.x}
                    cy={point.y}
                    r={radius + 8}
                  />
                )}
                <circle
                  className="team-core"
                  cx={point.x}
                  cy={point.y}
                  r={radius}
                  fill={STATUS_COLOR[status]}
                />
                <text className="team-glyph" x={point.x} y={point.y + 4}>
                  {STATUS_GLYPH[status as Status]}
                </text>
                <text className="team-label" x={point.x} y={point.y + radius + 28}>
                  {team.label}
                </text>
                <text className="team-meta" x={point.x} y={point.y + radius + 44}>
                  {workload} tasks · {status.replace('_', ' ')}
                </text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

export function Legend() {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const toggle = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA') return;
      if (event.key === '?') setOpen((value) => !value);
    };
    window.addEventListener('keydown', toggle);
    return () => window.removeEventListener('keydown', toggle);
  }, []);

  if (!open) {
    return (
      <button className="legend-toggle" type="button" onClick={() => setOpen(true)}>
        ? legend
      </button>
    );
  }

  const statuses: Status[] = ['done', 'in_progress', 'blocked', 'at_risk', 'not_started'];
  return (
    <div className="legend" aria-label="Graph status legend">
      <div className="legend-top">
        <span>STATUS</span>
        <button type="button" onClick={() => setOpen(false)} aria-label="Hide legend">
          ×
        </button>
      </div>
      <div className="legend-items">
        {statuses.map((status) => (
          <span key={status}>
            <i style={{ background: STATUS_COLOR[status] }} />
            {STATUS_GLYPH[status]} {status.replace('_', ' ')}
          </span>
        ))}
      </div>
      <span className="legend-hint">
        <kbd>?</kbd> toggle
      </span>
    </div>
  );
}

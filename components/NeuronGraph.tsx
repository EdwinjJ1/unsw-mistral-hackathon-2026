'use client';

import dynamic from 'next/dynamic';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { Graph, GraphEdge, GraphNode } from '@/lib/fake-types';
import fakeGraph from '@/lib/fake-graph';

// react-force-graph-2d touches `window` at module scope, so it must never be
// evaluated during server render. next/dynamic also does not forward refs, so
// the imperative handle is threaded through an explicit `fgRef` prop.
const ForceGraph2D = dynamic(
  async () => {
    const mod = await import('react-force-graph-2d');
    const Inner = mod.default;
    function ForceGraphWithRef({
      fgRef,
      ...rest
    }: Record<string, unknown> & { fgRef?: React.MutableRefObject<unknown> }) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return <Inner ref={fgRef as any} {...(rest as any)} />;
    }
    return ForceGraphWithRef;
  },
  { ssr: false },
);

const BACKGROUND = '#070b14';
const NODE_REL_SIZE = 4;

type RFNode = GraphNode & { x?: number; y?: number };
type RFLink = GraphEdge & { source: string | RFNode; target: string | RFNode };

const TASK_STATUS_COLOR: Record<string, string> = {
  not_started: '#64748b',
  in_progress: '#38bdf8',
  blocked: '#f59e0b',
  at_risk: '#f59e0b',
  done: '#22c55e',
};

function toRenderGraph(graph: Graph): { nodes: RFNode[]; links: RFLink[] } {
  return {
    nodes: graph.nodes.map((n) => ({ ...n })),
    links: graph.edges.map((e) => ({ ...e, source: e.from, target: e.to })),
  };
}

/**
 * Team size scales with how many tasks hang off it, capped so one huge team
 * cannot swallow the canvas.
 */
function teamVal(teamId: string, nodes: RFNode[]): number {
  const taskCount = nodes.filter(
    (n) => n.type === 'Task' && n.teamId === teamId,
  ).length;
  return Math.min(26, 8 + taskCount * 2);
}

function nodeVal(node: RFNode, nodes: RFNode[]): number {
  switch (node.type) {
    case 'Team':
      return teamVal(node.id, nodes);
    case 'Person':
      return 3;
    case 'Blocker':
      return 5;
    default:
      return 4;
  }
}

function nodeColor(node: RFNode, graph: { nodes: RFNode[]; links: RFLink[] }): string {
  switch (node.type) {
    case 'Team':
      return teamColor(node.id, graph);
    case 'Person':
      return '#93c5fd';
    case 'Decision':
      return '#a78bfa';
    case 'Blocker':
      return '#ef4444';
    case 'Task':
      return TASK_STATUS_COLOR[node.status ?? 'not_started'] ?? '#64748b';
    default:
      return '#64748b';
  }
}

const endpointId = (v: string | RFNode): string =>
  typeof v === 'string' ? v : v.id;

/** Aggregated health of everything hanging off a team. */
function teamColor(
  teamId: string,
  graph: { nodes: RFNode[]; links: RFLink[] },
): string {
  const members = graph.nodes.filter((n) => n.teamId === teamId);
  const scope = new Set<string>([teamId, ...members.map((n) => n.id)]);

  const hasConflict = graph.links.some(
    (l) =>
      l.type === 'CONFLICTS_WITH' &&
      (scope.has(endpointId(l.source)) || scope.has(endpointId(l.target))),
  );
  const blockerIds = new Set(
    graph.nodes.filter((n) => n.type === 'Blocker').map((n) => n.id),
  );
  const hasBlocker =
    members.some((n) => n.type === 'Blocker') ||
    graph.links.some((l) => {
      const a = endpointId(l.source);
      const b = endpointId(l.target);
      return (blockerIds.has(a) && scope.has(b)) || (blockerIds.has(b) && scope.has(a));
    });
  if (hasConflict || hasBlocker) return '#ef4444';

  const tasks = members.filter((n) => n.type === 'Task');
  if (tasks.length === 0) return '#38bdf8';
  if (tasks.some((t) => t.status === 'blocked' || t.status === 'at_risk')) {
    return '#f59e0b';
  }
  if (tasks.every((t) => t.status === 'done' || t.status === 'in_progress')) {
    return '#22c55e';
  }
  return '#38bdf8';
}

export default function NeuronGraph() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setSize({ width: el.clientWidth, height: el.clientHeight });
    });
    ro.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const graph = useMemo(() => toRenderGraph(fakeGraph), []);

  return (
    <div
      ref={wrapRef}
      style={{ position: 'relative', width: '100%', height: '100%', background: BACKGROUND }}
    >
      {size.width > 0 && (
        <ForceGraph2D
          graphData={graph}
          width={size.width}
          height={size.height}
          backgroundColor={BACKGROUND}
          nodeRelSize={NODE_REL_SIZE}
          nodeVal={(n: RFNode) => nodeVal(n, graph.nodes)}
          nodeColor={(n: RFNode) => nodeColor(n, graph)}
          nodeLabel={(n: RFNode) => n.label}
          linkColor={() => 'rgba(148,163,184,0.15)'}
          linkWidth={1}
        />
      )}
    </div>
  );
}

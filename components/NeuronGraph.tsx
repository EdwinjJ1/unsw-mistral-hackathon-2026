'use client';

import dynamic from 'next/dynamic';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { endpointId, useGraphPoll } from '@/lib/useGraphPoll';
import type { RFLink, RFNode, RenderGraph } from '@/lib/useGraphPoll';

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
const TAU = Math.PI * 2;

/** A node changed this recently → draw the expanding pulse ring. */
const PULSE_WINDOW_MS = 15_000;
/** An edge (or either of its endpoints) changed this recently → heavy particles. */
const HOT_WINDOW_MS = 30_000;

type Rgb = readonly [number, number, number];

const RGB: Record<string, Rgb> = {
  red: [239, 68, 68],
  amber: [245, 158, 11],
  green: [34, 197, 94],
  teal: [56, 189, 248],
  slate: [100, 116, 139],
  personBlue: [147, 197, 253],
  violet: [167, 139, 250],
  edge: [148, 163, 184],
};

const TASK_STATUS_RGB: Record<string, Rgb> = {
  not_started: RGB.slate,
  in_progress: RGB.teal,
  blocked: RGB.amber,
  at_risk: RGB.amber,
  done: RGB.green,
};

const rgba = ([r, g, b]: Rgb, alpha: number) =>
  `rgba(${r},${g},${b},${alpha})`;

const millis = (iso: string | undefined): number => {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};

/** Team nodes are the big neurons; they grow with the tasks hanging off them. */
function nodeVal(node: RFNode, graph: RenderGraph): number {
  switch (node.type) {
    case 'Team': {
      const tasks = graph.nodes.filter(
        (n) => n.type === 'Task' && n.teamId === node.id,
      ).length;
      return Math.min(26, 8 + tasks * 2);
    }
    case 'Person':
      return 3;
    case 'Blocker':
      return 5;
    default:
      return 4;
  }
}

/** Aggregated health of everything hanging off a team. */
function teamRgb(teamId: string, graph: RenderGraph): Rgb {
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
      return (
        (blockerIds.has(a) && scope.has(b)) || (blockerIds.has(b) && scope.has(a))
      );
    });
  if (hasConflict || hasBlocker) return RGB.red;

  const tasks = members.filter((n) => n.type === 'Task');
  if (tasks.length === 0) return RGB.teal;
  if (tasks.some((t) => t.status === 'blocked' || t.status === 'at_risk')) {
    return RGB.amber;
  }
  if (tasks.every((t) => t.status === 'done' || t.status === 'in_progress')) {
    return RGB.green;
  }
  return RGB.teal;
}

function nodeRgb(node: RFNode, graph: RenderGraph): Rgb {
  switch (node.type) {
    case 'Team':
      return teamRgb(node.id, graph);
    case 'Person':
      return RGB.personBlue;
    case 'Decision':
      return RGB.violet;
    case 'Blocker':
      return RGB.red;
    case 'Task':
      return TASK_STATUS_RGB[node.status ?? 'not_started'] ?? RGB.slate;
    default:
      return RGB.slate;
  }
}

const LINK_STYLE: Record<string, { rgb: Rgb; alpha: number; width: number }> = {
  CONFLICTS_WITH: { rgb: RGB.red, alpha: 0.85, width: 2.5 },
  DEPENDS_ON: { rgb: RGB.edge, alpha: 0.35, width: 1.5 },
  BLOCKS: { rgb: RGB.edge, alpha: 0.35, width: 1.5 },
};
const DEFAULT_LINK_STYLE = { rgb: RGB.edge, alpha: 0.15, width: 1 };

const linkStyle = (link: RFLink) => LINK_STYLE[link.type] ?? DEFAULT_LINK_STYLE;

/**
 * An edge counts as live when it changed recently, or when either endpoint did
 * — so a single node update lights up the synapses around it.
 */
function isHotLink(link: RFLink, now: number): boolean {
  if (now - millis(link.updatedAt) < HOT_WINDOW_MS) return true;
  const ends = [link.source, link.target];
  return ends.some(
    (e) =>
      typeof e !== 'string' && now - millis(e.updatedAt) < HOT_WINDOW_MS,
  );
}

export default function NeuronGraph() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() =>
      setSize({ width: el.clientWidth, height: el.clientHeight }),
    );
    ro.observe(el);
    setSize({ width: el.clientWidth, height: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const { graph } = useGraphPoll();

  // Track which links are "live" as a stable key. force-graph rebuilds a link's
  // particle set whenever the linkDirectionalParticles accessor identity
  // changes, so the accessor must only change when the live set really does —
  // otherwise every particle resets to the start of the wire on each render.
  const [hotKey, setHotKey] = useState('');
  useEffect(() => {
    const recompute = () => {
      const now = Date.now();
      const key = graph.links
        .filter((l) => isHotLink(l, now))
        .map((l) => l.id)
        .sort()
        .join(',');
      setHotKey((prev) => (prev === key ? prev : key));
    };
    recompute();
    const id = setInterval(recompute, 1000);
    return () => clearInterval(id);
  }, [graph]);

  const hotLinkIds = useMemo(
    () => new Set(hotKey ? hotKey.split(',') : []),
    [hotKey],
  );

  const paintNode = useCallback(
    (node: RFNode, ctx: CanvasRenderingContext2D, scale: number) => {
      if (node.x === undefined || node.y === undefined) return;
      const { x, y } = node;
      const radius = Math.sqrt(Math.max(0, nodeVal(node, graph))) * NODE_REL_SIZE;
      const rgb = nodeRgb(node, graph);
      const now = Date.now();

      // Soft halo — this is what makes the node read as a neuron rather than a
      // dot in a generic node-link diagram.
      const haloRadius = radius * 3;
      const halo = ctx.createRadialGradient(x, y, 0, x, y, haloRadius);
      halo.addColorStop(0, rgba(rgb, 0.25));
      halo.addColorStop(1, rgba(rgb, 0));
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(x, y, haloRadius, 0, TAU);
      ctx.fill();

      // Solid core.
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, TAU);
      ctx.fillStyle = rgba(rgb, 1);
      ctx.fill();

      // Change pulse: an expanding, fading ring driven straight off the clock.
      const age = now - millis(node.updatedAt);
      if (age >= 0 && age < PULSE_WINDOW_MS) {
        const phase = (now % 1400) / 1400;
        const fade = (1 - phase) * (1 - age / PULSE_WINDOW_MS);
        ctx.beginPath();
        ctx.arc(x, y, radius * 1.4 + phase * radius * 2.6, 0, TAU);
        ctx.strokeStyle = rgba(rgb, 0.85 * fade);
        ctx.lineWidth = 2 / scale;
        ctx.stroke();
      }

      if (node.type === 'Team') {
        ctx.font = `${11 / scale}px ui-sans-serif, system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#cbd5e1';
        ctx.fillText(node.label, x, y + radius + 6 / scale);
      }
    },
    [graph],
  );

  const linkColor = useCallback(
    (link: RFLink) => {
      const { rgb, alpha } = linkStyle(link);
      return rgba(rgb, alpha);
    },
    [],
  );

  const linkWidth = useCallback((link: RFLink) => linkStyle(link).width, []);

  const linkParticles = useCallback(
    (link: RFLink) => {
      if (link.type === 'CONFLICTS_WITH') return 4;
      return hotLinkIds.has(link.id) ? 6 : 2;
    },
    [hotLinkIds],
  );

  const linkParticleWidth = useCallback(
    (link: RFLink) => (isHotLink(link, Date.now()) ? 4 : 2),
    [],
  );

  const linkParticleColor = useCallback((link: RFLink) => {
    if (link.type === 'CONFLICTS_WITH') return rgba(RGB.red, 0.95);
    return isHotLink(link, Date.now())
      ? 'rgba(226,232,240,0.95)'
      : rgba(RGB.edge, 0.55);
  }, []);

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background: BACKGROUND,
      }}
    >
      {size.width > 0 && (
        <ForceGraph2D
          graphData={graph}
          width={size.width}
          height={size.height}
          backgroundColor={BACKGROUND}
          nodeRelSize={NODE_REL_SIZE}
          nodeVal={(n: RFNode) => nodeVal(n, graph)}
          nodeLabel={(n: RFNode) => n.label}
          nodeCanvasObject={paintNode}
          linkColor={linkColor}
          linkWidth={linkWidth}
          linkDirectionalParticles={linkParticles}
          linkDirectionalParticleSpeed={0.006}
          linkDirectionalParticleWidth={linkParticleWidth}
          linkDirectionalParticleColor={linkParticleColor}
          // The pulse ring animates off Date.now(), so the canvas has to keep
          // repainting even when the physics engine has gone quiet.
          autoPauseRedraw={false}
        />
      )}
    </div>
  );
}

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

const BACKGROUND = '#04060B';
const NODE_REL_SIZE = 4;
const TAU = Math.PI * 2;
const MONO_FONT = 'ui-monospace, SFMono-Regular, Menlo, monospace';

/** A node changed this recently → draw the expanding pulse ring. */
const PULSE_WINDOW_MS = 15_000;
/** An edge (or either of its endpoints) changed this recently → heavy particles. */
const HOT_WINDOW_MS = 30_000;

type Rgb = readonly [number, number, number];

// Deep-space instrument palette — cool blue-white glow, colour reserved for
// alarm (the CONFLICTS_WITH edge and anything it touches).
const RGB: Record<string, Rgb> = {
  team: [234, 241, 255], // bright blue-white
  teamQuiet: [120, 135, 165], // dim cool grey-blue
  task: [150, 165, 195],
  person: [95, 106, 130],
  decision: [112, 124, 150],
  alarm: [255, 61, 61],
  label: [200, 212, 232],
  edge: [150, 170, 210],
};

const TASK_STATUS_RGB: Record<string, Rgb> = {
  not_started: [70, 78, 96],
  in_progress: [150, 165, 195],
  blocked: [234, 241, 255],
  at_risk: [234, 241, 255],
  done: [95, 106, 130],
};

const rgba = ([r, g, b]: Rgb, alpha: number) =>
  `rgba(${r},${g},${b},${alpha})`;

const millis = (iso: string | undefined): number => {
  if (!iso) return 0;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? t : 0;
};

/** Deterministic curvature per link so the wires bow like organic dendrites
 * instead of ruling straight lines — purely cosmetic, has no effect on layout. */
function linkCurve(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return ((h % 1000) / 1000) * 0.5 - 0.25;
}

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

/**
 * Health reads as luminance, not hue. Trouble is bright, healthy work recedes.
 * `alarm` is the only saturated signal — reserved for conflicts and blockers.
 */
function teamHealth(
  teamId: string,
  graph: RenderGraph,
): { rgb: Rgb; alarm: boolean; strong: boolean } {
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
  if (hasConflict || hasBlocker) {
    return { rgb: RGB.team, alarm: true, strong: false };
  }

  const tasks = members.filter((n) => n.type === 'Task');
  if (tasks.some((t) => t.status === 'blocked' || t.status === 'at_risk')) {
    return { rgb: RGB.team, alarm: false, strong: true };
  }
  return { rgb: RGB.teamQuiet, alarm: false, strong: false };
}

/** Whether a non-team node should carry the red alarm ring. */
function nodeAlarm(node: RFNode, graph: RenderGraph): boolean {
  if (node.type === 'Blocker') return true;
  if (node.type === 'Task' && (node.status === 'blocked' || node.status === 'at_risk')) {
    return true;
  }
  return graph.links.some((l) => {
    if (l.type !== 'CONFLICTS_WITH') return false;
    return endpointId(l.source) === node.id || endpointId(l.target) === node.id;
  });
}

function nodeRgb(node: RFNode, graph: RenderGraph): Rgb {
  switch (node.type) {
    case 'Team':
      return teamHealth(node.id, graph).rgb;
    case 'Person':
      return RGB.person;
    case 'Decision':
      return RGB.decision;
    case 'Blocker':
      return RGB.alarm;
    case 'Task':
      return TASK_STATUS_RGB[node.status ?? 'not_started'] ?? RGB.task;
    default:
      return RGB.task;
  }
}

const LINK_STYLE: Record<string, { rgb: Rgb; alpha: number; width: number }> = {
  CONFLICTS_WITH: { rgb: RGB.alarm, alpha: 0.9, width: 1.6 },
  DEPENDS_ON: { rgb: RGB.edge, alpha: 0.22, width: 0.75 },
  BLOCKS: { rgb: RGB.edge, alpha: 0.22, width: 0.75 },
};
const DEFAULT_LINK_STYLE = { rgb: RGB.edge, alpha: 0.12, width: 0.6 };

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

/** Draws mono text with manual letter-spacing, using ctx.letterSpacing when available. */
function drawMonoLabel(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  letterSpacing: number,
  color: string,
): void {
  ctx.font = `${size}px ${MONO_FONT}`;
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  if (typeof ctx.letterSpacing === 'string') {
    ctx.textAlign = 'center';
    ctx.letterSpacing = `${letterSpacing}px`;
    ctx.fillText(text, x, y);
    ctx.letterSpacing = '0px';
    return;
  }
  const chars = [...text];
  const widths = chars.map((ch) => ctx.measureText(ch).width);
  const total = widths.reduce((a, b) => a + b, 0) + letterSpacing * (chars.length - 1);
  ctx.textAlign = 'left';
  let cx = x - total / 2;
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], cx, y);
    cx += widths[i] + letterSpacing;
  }
}

/** Subset of the react-force-graph imperative handle this component uses. */
interface ForceGraphHandle {
  d3Force: (name: string) => { strength?: (v: number) => void; distance?: (v: number) => void } | undefined;
  zoomToFit: (ms?: number, padding?: number) => void;
}

interface Highlight {
  nodeId: string | null;
  nodes: Set<string>;
  links: Set<string>;
}

const NO_HIGHLIGHT: Highlight = {
  nodeId: null,
  nodes: new Set(),
  links: new Set(),
};

const DIM = 0.3;

export interface NeuronGraphProps {
  /** Fired with the node's slug id on click, or "" when the canvas is cleared. */
  onSelect?: (nodeId: string) => void;
  selectedId?: string;
}

export default function NeuronGraph({ onSelect, selectedId }: NeuronGraphProps) {
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

  const { graph, stale } = useGraphPoll();
  // Canvas accessors read the graph through a ref so their identity stays
  // stable across polls; a new paint closure would force a needless re-render.
  const graphRef = useRef<RenderGraph>(graph);
  useEffect(() => {
    graphRef.current = graph;
  }, [graph]);

  // Hover lives in a ref rather than state: the canvas already repaints every
  // frame, so highlighting costs nothing and never triggers a React render
  // (a render would rebuild the link particles).
  const highlightRef = useRef<Highlight>(NO_HIGHLIGHT);

  // Standalone fallback when no onSelect is wired up yet.
  const [ownSelectedId, setOwnSelectedId] = useState('');
  const [card, setCard] = useState<{ node: RFNode; x: number; y: number } | null>(
    null,
  );
  const activeSelectedId = selectedId ?? ownSelectedId;

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

  const conflictLinks = useMemo(
    () => graph.links.filter((l) => l.type === 'CONFLICTS_WITH'),
    [graph],
  );

  const paintNode = useCallback(
    (node: RFNode, ctx: CanvasRenderingContext2D, scale: number) => {
      if (node.x === undefined || node.y === undefined) return;
      const { x, y } = node;
      const graph = graphRef.current;
      const highlight = highlightRef.current;
      const radius = Math.sqrt(Math.max(0, nodeVal(node, graph))) * NODE_REL_SIZE;
      const rgb = nodeRgb(node, graph);
      const now = Date.now();

      const selected = node.id === activeSelectedId;
      const dim =
        highlight.nodeId && !highlight.nodes.has(node.id) ? DIM : 1;

      const team = node.type === 'Team' ? teamHealth(node.id, graph) : null;
      const alarmed = team ? team.alarm : nodeAlarm(node, graph);
      const strong = team ? team.strong : false;
      const glowRgb = alarmed ? RGB.alarm : rgb;

      // Soft outer bloom, like a diffraction halo around a distant light.
      ctx.beginPath();
      ctx.arc(x, y, radius * 4.5, 0, TAU);
      ctx.fillStyle = rgba(glowRgb, (alarmed ? 0.1 : 0.045) * dim);
      ctx.fill();

      ctx.beginPath();
      ctx.arc(x, y, radius * 2.6, 0, TAU);
      ctx.fillStyle = rgba(glowRgb, (alarmed ? 0.16 : 0.08) * dim);
      ctx.fill();

      // Thin concentric diffraction rings.
      ctx.lineWidth = 0.75 / scale;
      ctx.strokeStyle = rgba(glowRgb, 0.22 * dim);
      ctx.beginPath();
      ctx.arc(x, y, radius * 2.1, 0, TAU);
      ctx.stroke();
      ctx.strokeStyle = rgba(glowRgb, 0.32 * dim);
      ctx.beginPath();
      ctx.arc(x, y, radius * 1.5, 0, TAU);
      ctx.stroke();

      if (strong) {
        ctx.beginPath();
        ctx.arc(x, y, radius * 3.2, 0, TAU);
        ctx.fillStyle = rgba(RGB.team, 0.06 * dim);
        ctx.fill();
      }

      // Solid bright core.
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, TAU);
      ctx.fillStyle = rgba(rgb, dim);
      ctx.fill();

      if (selected) {
        ctx.beginPath();
        ctx.arc(x, y, radius + 3 / scale, 0, TAU);
        ctx.strokeStyle = 'rgba(255,255,255,0.9)';
        ctx.lineWidth = 1.5 / scale;
        ctx.stroke();
      }

      // Change pulse: an expanding, fading ring driven straight off the clock.
      const age = now - millis(node.updatedAt);
      if (age >= 0 && age < PULSE_WINDOW_MS) {
        const phase = (now % 1400) / 1400;
        const fade = (1 - phase) * (1 - age / PULSE_WINDOW_MS);
        ctx.beginPath();
        ctx.arc(x, y, radius * 1.4 + phase * radius * 2.6, 0, TAU);
        ctx.strokeStyle = rgba(glowRgb, 0.85 * fade * dim);
        ctx.lineWidth = 2 / scale;
        ctx.stroke();
      }

      const showLabel =
        node.type === 'Team' || selected || highlight.nodeId === node.id;
      if (showLabel) {
        drawMonoLabel(
          ctx,
          node.label,
          x,
          y + radius + 6 / scale,
          11 / scale,
          1.1 / scale,
          rgba(RGB.label, dim),
        );
      }
    },
    [activeSelectedId],
  );

  const linkColor = useCallback((link: RFLink) => {
    const { rgb, alpha } = linkStyle(link);
    const highlight = highlightRef.current;
    const dim = highlight.nodeId && !highlight.links.has(link.id) ? DIM : 1;
    return rgba(rgb, alpha * dim);
  }, []);

  const linkWidth = useCallback((link: RFLink) => linkStyle(link).width, []);

  const linkCurvature = useCallback((link: RFLink) => linkCurve(link.id), []);

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
    if (link.type === 'CONFLICTS_WITH') return rgba(RGB.alarm, 0.95);
    return isHotLink(link, Date.now())
      ? 'rgba(255,255,255,0.95)'
      : rgba(RGB.edge, 0.6);
  }, []);

  const handleNodeHover = useCallback((node: RFNode | null) => {
    if (!node) {
      highlightRef.current = NO_HIGHLIGHT;
      return;
    }
    const nodes = new Set<string>([node.id]);
    const links = new Set<string>();
    for (const link of graphRef.current.links) {
      const a = endpointId(link.source);
      const b = endpointId(link.target);
      if (a !== node.id && b !== node.id) continue;
      links.add(link.id);
      nodes.add(a);
      nodes.add(b);
    }
    highlightRef.current = { nodeId: node.id, nodes, links };
  }, []);

  const handleNodeClick = useCallback(
    (node: RFNode, event: MouseEvent) => {
      if (onSelect) {
        onSelect(node.id);
        return;
      }
      console.log(node.id);
      setOwnSelectedId(node.id);
      setCard({ node, x: event.offsetX, y: event.offsetY });
    },
    [onSelect],
  );

  const handleBackgroundClick = useCallback(() => {
    if (onSelect) {
      onSelect('');
      return;
    }
    console.log('');
    setOwnSelectedId('');
    setCard(null);
  }, [onSelect]);

  // Physics. The imperative handle only exists once the dynamically imported
  // component has mounted, so the forces are applied from the first engine tick.
  const fgRef = useRef<ForceGraphHandle | null>(null);
  const forcesApplied = useRef(false);
  const didInitialFit = useRef(false);

  const handleEngineTick = useCallback(() => {
    if (forcesApplied.current) return;
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force('charge')?.strength?.(-120);
    fg.d3Force('link')?.distance?.(55);
    forcesApplied.current = true;
  }, []);

  // Only on the very first settle — re-fitting on every poll would yank the
  // viewport around exactly when a judge is looking at a live update.
  const handleEngineStop = useCallback(() => {
    if (didInitialFit.current) return;
    didInitialFit.current = true;
    fgRef.current?.zoomToFit(400, 60);
  }, []);

  return (
    <div
      ref={wrapRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        background:
          'radial-gradient(ellipse at 50% 15%, #0b1220 0%, #04060B 55%, #030408 100%)',
      }}
    >
      {size.width > 0 && (
        <ForceGraph2D
          fgRef={fgRef as React.MutableRefObject<unknown>}
          graphData={graph}
          width={size.width}
          height={size.height}
          backgroundColor={BACKGROUND}
          nodeRelSize={NODE_REL_SIZE}
          nodeVal={(n: RFNode) => nodeVal(n, graphRef.current)}
          nodeLabel={() => ''}
          nodeCanvasObject={paintNode}
          linkColor={linkColor}
          linkWidth={linkWidth}
          linkCurvature={linkCurvature}
          linkDirectionalParticles={linkParticles}
          linkDirectionalParticleSpeed={0.005}
          linkDirectionalParticleWidth={linkParticleWidth}
          linkDirectionalParticleColor={linkParticleColor}
          onNodeHover={handleNodeHover}
          onNodeClick={handleNodeClick}
          onBackgroundClick={handleBackgroundClick}
          d3VelocityDecay={0.3}
          cooldownTicks={150}
          onEngineTick={handleEngineTick}
          onEngineStop={handleEngineStop}
          // The pulse ring animates off Date.now(), so the canvas has to keep
          // repainting even when the physics engine has gone quiet.
          autoPauseRedraw={false}
        />
      )}

      {/* Top bar */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 38,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          borderBottom: '0.5px solid rgba(255,255,255,0.09)',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            font: `12px ${MONO_FONT}`,
            letterSpacing: '2.4px',
            color: '#FAFAFA',
          }}
        >
          ATHENA
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div
            style={{
              width: 2.5,
              height: 2.5,
              borderRadius: '50%',
              background: stale ? '#F59E0B' : '#4ADE80',
            }}
          />
          <div style={{ font: `11px ${MONO_FONT}`, color: '#71717A' }}>
            {stale ? 'offline · fixture' : `live · ${graph.nodes.length} nodes`}
          </div>
        </div>
      </div>

      {/* Legend pill */}
      <div
        style={{
          position: 'absolute',
          left: 16,
          bottom: 16,
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '6px 12px',
          borderRadius: 4,
          background: 'rgba(255,255,255,0.03)',
          border: '0.5px solid rgba(255,255,255,0.07)',
          font: `11px ${MONO_FONT}`,
          color: '#71717A',
          pointerEvents: 'none',
        }}
      >
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: '#EAF1FF',
            }}
          />
          Team
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span
            style={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: '#96A3C3',
            }}
          />
          Task
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ width: 12, height: 1.6, background: '#FF3D3D' }} />
          Conflict
        </span>
      </div>

      {/* Alert pill — only when there is something to alarm about */}
      {conflictLinks.length > 0 && (
        <div
          style={{
            position: 'absolute',
            right: 16,
            bottom: 16,
            maxWidth: 280,
            padding: '8px 12px',
            borderRadius: 4,
            background: 'rgba(255,61,61,0.06)',
            border: '1px solid rgba(255,61,61,0.28)',
            font: `11px ${MONO_FONT}`,
            pointerEvents: 'none',
          }}
        >
          <div style={{ color: '#FF3D3D' }}>
            {conflictLinks.length} unresolved conflict{conflictLinks.length === 1 ? '' : 's'}
          </div>
          {conflictLinks[0].note && (
            <div style={{ color: '#8A6567', marginTop: 2 }}>{conflictLinks[0].note}</div>
          )}
        </div>
      )}

      {card && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(card.x + 12, Math.max(0, size.width - 240)),
            top: Math.min(card.y + 12, Math.max(0, size.height - 110)),
            width: 220,
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(4,6,11,0.94)',
            font: `11px ${MONO_FONT}`,
            pointerEvents: 'none',
          }}
        >
          <div style={{ fontWeight: 600, marginBottom: 4, color: '#EAF1FF' }}>
            {card.node.label}
          </div>
          <div style={{ color: '#71717A' }}>{card.node.type}</div>
          {card.node.status && <div style={{ color: '#71717A' }}>{card.node.status}</div>}
        </div>
      )}
    </div>
  );
}

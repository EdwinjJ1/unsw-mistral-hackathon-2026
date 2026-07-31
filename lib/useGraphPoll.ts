'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Graph, GraphEdge, GraphNode } from './fake-types';
import fakeGraph from './fake-graph';

/**
 * A node as react-force-graph sees it. x/y/vx/vy/fx/fy/index are owned by the
 * physics engine and must never be written by merge logic on an existing node.
 */
export type RFNode = GraphNode & {
  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
};

/** An edge remapped to the source/target shape react-force-graph expects. */
export type RFLink = GraphEdge & {
  source: string | RFNode;
  target: string | RFNode;
};

export interface RenderGraph {
  nodes: RFNode[];
  links: RFLink[];
}

export const endpointId = (v: string | RFNode): string =>
  typeof v === 'string' ? v : v.id;

// Fields the server owns. Anything not listed here (notably physics state) is
// left untouched when an existing node/link is refreshed.
const NODE_FIELDS = [
  'type',
  'label',
  'teamId',
  'status',
  'summary',
  'ownerId',
  'dueDate',
  'discordUserId',
  'updatedAt',
  'sourceRef',
] as const;

const LINK_FIELDS = ['type', 'note', 'updatedAt', 'sourceRef'] as const;

const hasPosition = (n: RFNode | undefined): n is RFNode =>
  !!n && Number.isFinite(n.x) && Number.isFinite(n.y);

/**
 * Cheap "did anything change" fingerprint. ISO-8601 UTC strings sort
 * lexicographically, so a plain string max is a valid latest-timestamp.
 */
function signature(graph: Graph, source: string): string {
  let latest = '';
  for (const n of graph.nodes) if (n.updatedAt > latest) latest = n.updatedAt;
  for (const e of graph.edges) if (e.updatedAt > latest) latest = e.updatedAt;
  return `${source}|${graph.nodes.length}|${graph.edges.length}|${latest}`;
}

/**
 * Place a brand-new node next to whatever it belongs to, so it visibly grows
 * out of the right cluster rather than flying in from the canvas origin.
 */
function seedPosition(
  node: RFNode,
  byId: Map<string, RFNode>,
  edges: GraphEdge[],
): void {
  let anchor: RFNode | undefined;

  if (node.teamId) {
    const team = byId.get(node.teamId);
    if (hasPosition(team)) anchor = team;
  }
  if (!anchor) {
    for (const e of edges) {
      if (e.from !== node.id && e.to !== node.id) continue;
      const other = byId.get(e.from === node.id ? e.to : e.from);
      if (hasPosition(other)) {
        anchor = other;
        break;
      }
    }
  }
  if (!anchor) return;

  const angle = Math.random() * Math.PI * 2;
  node.x = anchor.x! + Math.cos(angle) * 12;
  node.y = anchor.y! + Math.sin(angle) * 12;
  node.vx = 0;
  node.vy = 0;
}

/**
 * Fold `next` into the long-lived `store` in place.
 *
 * react-force-graph re-heats its simulation every time it is handed a new
 * graphData object, so the entire graph would re-explode on every poll if we
 * simply replaced the arrays. Instead existing objects keep their identity (and
 * therefore their x/y/vx/vy) and only their data fields are overwritten.
 *
 * Returns true when nodes/links were added, removed or re-pointed — the only
 * cases where react-force-graph genuinely has to be told about the change.
 */
export function mergeGraph(store: RenderGraph, next: Graph): boolean {
  const byId = new Map(store.nodes.map((n) => [n.id, n]));
  let structural = false;
  const added: RFNode[] = [];

  const incomingNodeIds = new Set<string>();
  for (const incoming of next.nodes) {
    incomingNodeIds.add(incoming.id);
    const existing = byId.get(incoming.id);
    if (existing) {
      for (const field of NODE_FIELDS) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (existing as any)[field] = incoming[field];
      }
    } else {
      const fresh: RFNode = { ...incoming };
      store.nodes.push(fresh);
      byId.set(fresh.id, fresh);
      added.push(fresh);
      structural = true;
    }
  }
  for (let i = store.nodes.length - 1; i >= 0; i--) {
    if (!incomingNodeIds.has(store.nodes[i].id)) {
      store.nodes.splice(i, 1);
      structural = true;
    }
  }

  const linkById = new Map(store.links.map((l) => [l.id, l]));
  const incomingLinkIds = new Set<string>();
  for (const incoming of next.edges) {
    incomingLinkIds.add(incoming.id);
    const existing = linkById.get(incoming.id);
    if (existing) {
      for (const field of LINK_FIELDS) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (existing as any)[field] = incoming[field];
      }
      // Re-pointing an edge changes the topology, so d3 has to re-link it.
      if (existing.from !== incoming.from || existing.to !== incoming.to) {
        existing.from = incoming.from;
        existing.to = incoming.to;
        existing.source = incoming.from;
        existing.target = incoming.to;
        structural = true;
      }
    } else {
      store.links.push({
        ...incoming,
        source: incoming.from,
        target: incoming.to,
      });
      structural = true;
    }
  }
  for (let i = store.links.length - 1; i >= 0; i--) {
    if (!incomingLinkIds.has(store.links[i].id)) {
      store.links.splice(i, 1);
      structural = true;
    }
  }

  for (const node of added) seedPosition(node, byId, next.edges);

  return structural;
}

const isGraph = (value: unknown): value is Graph =>
  !!value &&
  Array.isArray((value as Graph).nodes) &&
  Array.isArray((value as Graph).edges);

export interface UseGraphPoll {
  graph: RenderGraph;
  stale: boolean;
  forceRefresh: () => void;
}

/**
 * Polls the graph API and folds each response into one long-lived graph object.
 * Never throws and never blanks the view: any failure falls back to the local
 * fixture and raises `stale`.
 */
export function useGraphPoll(
  url = '/api/graph',
  intervalMs = 3000,
): UseGraphPoll {
  const storeRef = useRef<RenderGraph>({ nodes: [], links: [] });
  const signatureRef = useRef<string | null>(null);
  const [graph, setGraph] = useState<RenderGraph>({ nodes: [], links: [] });
  const [stale, setStale] = useState(false);
  const tickRef = useRef<() => void>(() => {});

  useEffect(() => {
    let cancelled = false;

    const tick = async () => {
      let payload: Graph | null = null;
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) {
          const json: unknown = await res.json();
          if (isGraph(json)) payload = json;
        }
      } catch {
        // Network error, API not built yet, bad JSON — all handled identically.
      }
      if (cancelled) return;

      const offline = payload === null;
      const data = payload ?? fakeGraph;
      setStale((prev) => (prev === offline ? prev : offline));

      const sig = signature(data, offline ? 'fixture' : 'live');
      if (sig === signatureRef.current) return;
      signatureRef.current = sig;

      if (mergeGraph(storeRef.current, data)) {
        // Same node/link object identities, fresh array wrapper — this is the
        // only thing react-force-graph needs to re-link, and positions survive.
        setGraph({
          nodes: storeRef.current.nodes.slice(),
          links: storeRef.current.links.slice(),
        });
      }
    };

    tickRef.current = () => {
      void tick();
    };
    void tick();
    const id = setInterval(() => void tick(), intervalMs);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [url, intervalMs]);

  const forceRefresh = useCallback(() => tickRef.current(), []);

  return { graph, stale, forceRefresh };
}

export default useGraphPoll;

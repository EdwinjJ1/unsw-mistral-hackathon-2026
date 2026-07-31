'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { applyDelta } from './derive';
import { fetchGraph } from './api';
import { createFixtureGraph } from './fixtures';
import type { Delta, Graph } from './types';

const POLL_MS = 3_000;
const RECENT_TTL = 30_000;

interface GraphContextValue {
  graph: Graph;
  lastSyncAt: number;
  heartbeat: number;
  backendAvailable: boolean;
  mock: boolean;
  selectedId: string | null;
  select(id: string | null): void;
  isRecent(id: string): boolean;
  highlightIds: Set<string>;
  setHighlight(ids: string[]): void;
  focusRequest: { id: string; at: number } | null;
  applyLocalDelta(delta: Delta): void;
}

const GraphContext = createContext<GraphContextValue | null>(null);

export function GraphProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const mock = searchParams.get('mock') === '1';
  const selectedId = searchParams.get('team');
  // Keep server and client markup deterministic. The first real/fixture
  // snapshot is installed by the polling effect immediately after hydration.
  const [graph, setGraph] = useState<Graph>({ nodes: [], edges: [] });
  const [lastSyncAt, setLastSyncAt] = useState(() => Date.now());
  const [heartbeat, setHeartbeat] = useState(0);
  const [backendAvailable, setBackendAvailable] = useState(false);
  const [highlightIds, setHighlightState] = useState<Set<string>>(new Set());
  const [focusRequest, setFocusRequest] = useState<{ id: string; at: number } | null>(null);
  const previousStamps = useRef(new Map<string, string>());
  const changedAt = useRef(new Map<string, number>());

  useEffect(() => {
    let cancelled = false;
    let timer: number | undefined;

    const tick = async () => {
      if (document.hidden) {
        timer = window.setTimeout(tick, POLL_MS);
        return;
      }
      try {
        const nextGraph = await fetchGraph(mock);
        if (cancelled) return;
        const next = new Map<string, string>();
        const first = previousStamps.current.size === 0;
        for (const item of [...nextGraph.nodes, ...nextGraph.edges]) {
          next.set(item.id, item.updatedAt);
          if (!first && previousStamps.current.get(item.id) !== item.updatedAt) {
            changedAt.current.set(item.id, Date.now());
          }
        }
        previousStamps.current = next;
        // Mock mode is a stable in-memory demo. After its first snapshot, keep
        // locally applied ingest deltas instead of replacing them every poll.
        if (!mock || first) setGraph(nextGraph);
        setLastSyncAt(Date.now());
        setHeartbeat((value) => value + 1);
        setBackendAvailable(!mock);
      } catch {
        if (cancelled) return;
        setGraph((current) => (current.nodes.length ? current : createFixtureGraph()));
        setBackendAvailable(false);
        setLastSyncAt(Date.now());
        setHeartbeat((value) => value + 1);
      } finally {
        if (!cancelled) timer = window.setTimeout(tick, POLL_MS);
      }
    };

    void tick();
    return () => {
      cancelled = true;
      if (timer) window.clearTimeout(timer);
    };
  }, [mock]);

  const select = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (id) {
        params.set('team', id);
        setFocusRequest({ id, at: Date.now() });
      } else {
        params.delete('team');
      }
      const query = params.toString();
      router.replace(`${pathname}${query ? `?${query}` : ''}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const isRecent = useCallback(
    (id: string) => Date.now() - (changedAt.current.get(id) ?? 0) < RECENT_TTL,
    [],
  );

  const setHighlight = useCallback((ids: string[]) => {
    setHighlightState(new Set(ids));
    if (ids[0]) setFocusRequest({ id: ids[0], at: Date.now() });
  }, []);

  const applyLocalDelta = useCallback((delta: Delta) => {
    const stamp = Date.now();
    for (const item of [...(delta.upsertNodes ?? []), ...(delta.upsertEdges ?? [])]) {
      changedAt.current.set(item.id, stamp);
    }
    setGraph((current) => applyDelta(current, delta));
    setLastSyncAt(stamp);
    setHeartbeat((value) => value + 1);
  }, []);

  const value = useMemo(
    () => ({
      graph,
      lastSyncAt,
      heartbeat,
      backendAvailable,
      mock,
      selectedId,
      select,
      isRecent,
      highlightIds,
      setHighlight,
      focusRequest,
      applyLocalDelta,
    }),
    [
      graph,
      lastSyncAt,
      heartbeat,
      backendAvailable,
      mock,
      selectedId,
      select,
      isRecent,
      highlightIds,
      setHighlight,
      focusRequest,
      applyLocalDelta,
    ],
  );

  return <GraphContext.Provider value={value}>{children}</GraphContext.Provider>;
}

export function useGraph() {
  const value = useContext(GraphContext);
  if (!value) throw new Error('useGraph must be used inside GraphProvider');
  return value;
}

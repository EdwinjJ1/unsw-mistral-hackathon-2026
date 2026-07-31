import type { Graph } from './types';

export interface GraphPollingState {
  graph: Graph | null;
  error: string | null;
  loading: boolean;
}

type GraphFetcher = (
  input: string,
  init?: RequestInit,
) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

type IntervalHandle = ReturnType<typeof setInterval>;

export interface GraphPoller {
  getState(): GraphPollingState;
  refresh(): Promise<void>;
  start(): Promise<void>;
  stop(): void;
}

export interface GraphPollerOptions {
  onChange: (state: GraphPollingState) => void;
  fetcher?: GraphFetcher;
  intervalMs?: number;
  setIntervalFn?: (
    callback: () => void,
    intervalMs: number,
  ) => IntervalHandle;
  clearIntervalFn?: (handle: IntervalHandle) => void;
}

function isGraph(value: unknown): value is Graph {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<Graph>;
  return Array.isArray(candidate.nodes) && Array.isArray(candidate.edges);
}

function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Athena could not refresh the graph.';
}

export async function fetchGraph(
  fetcher: GraphFetcher = (input, init) => fetch(input, init),
  signal?: AbortSignal,
): Promise<Graph> {
  const response = await fetcher('/api/graph', {
    cache: 'no-store',
    signal,
  });

  if (!response.ok) {
    throw new Error(`Graph request failed (${response.status}).`);
  }

  const data: unknown = await response.json();
  if (!isGraph(data)) {
    throw new Error('Graph response is malformed.');
  }

  return data;
}

export function createGraphPoller({
  onChange,
  fetcher = (input, init) => fetch(input, init),
  intervalMs = 3_000,
  setIntervalFn = (callback, delay) => setInterval(callback, delay),
  clearIntervalFn = (handle) => clearInterval(handle),
}: GraphPollerOptions): GraphPoller {
  let state: GraphPollingState = {
    graph: null,
    error: null,
    loading: true,
  };
  let stopped = true;
  let inFlight = false;
  let intervalHandle: IntervalHandle | undefined;
  let abortController: AbortController | undefined;

  function publish(patch: Partial<GraphPollingState>): void {
    state = { ...state, ...patch };
    onChange({ ...state });
  }

  async function refresh(): Promise<void> {
    if (stopped || inFlight) {
      return;
    }

    inFlight = true;
    if (!state.graph) {
      publish({ error: null, loading: true });
    }

    try {
      const nextGraph = await fetchGraph(fetcher, abortController?.signal);
      if (!stopped) {
        publish({ graph: nextGraph, error: null, loading: false });
      }
    } catch (error) {
      if (!stopped && !abortController?.signal.aborted) {
        publish({ error: errorMessage(error), loading: false });
      }
    } finally {
      inFlight = false;
    }
  }

  async function start(): Promise<void> {
    if (!stopped) {
      return;
    }

    stopped = false;
    abortController = new AbortController();
    intervalHandle = setIntervalFn(() => {
      void refresh();
    }, intervalMs);
    await refresh();
  }

  function stop(): void {
    if (stopped) {
      return;
    }

    stopped = true;
    abortController?.abort();
    if (intervalHandle !== undefined) {
      clearIntervalFn(intervalHandle);
      intervalHandle = undefined;
    }
  }

  return {
    getState: () => ({ ...state }),
    refresh,
    start,
    stop,
  };
}

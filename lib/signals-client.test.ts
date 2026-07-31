import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createGraphPoller,
  fetchGraph,
  type GraphPollingState,
} from './signals-client.ts';

const EMPTY_GRAPH = { nodes: [], edges: [] };

function response(data: unknown, options: { ok?: boolean; status?: number } = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    json: async () => data,
  };
}

test('fetchGraph requests the graph without caching', async () => {
  let request:
    | { input: string; init: RequestInit | undefined }
    | undefined;

  const result = await fetchGraph(async (input, init) => {
    request = { input, init };
    return response(EMPTY_GRAPH);
  });

  assert.deepEqual(result, EMPTY_GRAPH);
  assert.equal(request?.input, '/api/graph');
  assert.equal(request?.init?.cache, 'no-store');
});

test('fetchGraph reports HTTP and malformed payload failures', async () => {
  await assert.rejects(
    fetchGraph(async () => response({}, { ok: false, status: 503 })),
    /Graph request failed \(503\)/,
  );
  await assert.rejects(
    fetchGraph(async () => response({ nodes: [] })),
    /Graph response is malformed/,
  );
});

test('poller loads immediately, schedules 3s refreshes, and preserves the last graph on error', async () => {
  const updatedGraph = {
    nodes: [
      {
        id: 'task.new',
        type: 'Task',
        label: 'New',
        updatedAt: '2026-07-31T06:00:00.000Z',
      },
    ],
    edges: [],
  };
  const results: Array<unknown> = [
    EMPTY_GRAPH,
    new Error('temporary outage'),
    updatedGraph,
  ];
  const states: GraphPollingState[] = [];
  let scheduledDelay: number | undefined;
  let cleared = false;

  const poller = createGraphPoller({
    onChange: (state) => states.push(state),
    fetcher: async () => {
      const next = results.shift();
      if (next instanceof Error) {
        throw next;
      }
      return response(next);
    },
    setIntervalFn: (_callback, delay) => {
      scheduledDelay = delay;
      return 1 as never;
    },
    clearIntervalFn: () => {
      cleared = true;
    },
  });

  await poller.start();
  assert.equal(scheduledDelay, 3_000);
  assert.deepEqual(poller.getState(), {
    graph: EMPTY_GRAPH,
    error: null,
    loading: false,
  });

  await poller.refresh();
  assert.deepEqual(poller.getState(), {
    graph: EMPTY_GRAPH,
    error: 'temporary outage',
    loading: false,
  });

  await poller.refresh();
  assert.deepEqual(poller.getState(), {
    graph: updatedGraph,
    error: null,
    loading: false,
  });

  poller.stop();
  assert.equal(cleared, true);
  assert.ok(states.length >= 3);
});

test('poller exposes a blocking first-load error and supports retry', async () => {
  let attempt = 0;
  const poller = createGraphPoller({
    onChange: () => undefined,
    fetcher: async () => {
      attempt += 1;
      if (attempt === 1) {
        throw new Error('offline');
      }
      return response(EMPTY_GRAPH);
    },
    setIntervalFn: () => 1 as never,
    clearIntervalFn: () => undefined,
  });

  await poller.start();
  assert.deepEqual(poller.getState(), {
    graph: null,
    error: 'offline',
    loading: false,
  });

  await poller.refresh();
  assert.deepEqual(poller.getState(), {
    graph: EMPTY_GRAPH,
    error: null,
    loading: false,
  });

  poller.stop();
});
